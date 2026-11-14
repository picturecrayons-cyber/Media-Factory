import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqualHex(a: string, b: string) {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function sha256(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function eventId(payload: any, raw: string) {
  const event = payload?.event ?? "unknown";
  const payment = payload?.payload?.payment?.entity;
  const order = payload?.payload?.order?.entity;
  const refund = payload?.payload?.refund?.entity;
  const subscription = payload?.payload?.subscription?.entity;
  return (payment?.id && `${event}:${payment.id}`)
    || (order?.id && `${event}:${order.id}`)
    || (refund?.id && `${event}:${refund.id}`)
    || (subscription?.id && `${event}:${subscription.id}`)
    || `${event}:${await sha256(raw)}`;
}

function detectSurface(payload: any) {
  const payment = payload?.payload?.payment?.entity;
  const order = payload?.payload?.order?.entity;
  const notes = { ...(order?.notes ?? {}), ...(payment?.notes ?? {}) };
  const explicit = String(notes.surface ?? notes.product ?? notes.app ?? notes.source ?? "").toLowerCase();
  if (explicit.includes("loop") || notes.planKey || notes.accessType) return "loop";
  if (explicit.includes("streamvista") || explicit.includes("studio") || notes.context === "inaugural_founder_activation") return "streamvista";
  if (explicit.includes("bridge") || notes.titleId) return "bridge";
  return "unknown";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

async function failEvent(supabase: any, id: string, message: string) {
  console.error(message);
  await supabase.from("bridge_webhook_events")
    .update({ status: "failed", processing_token: null, processing_started_at: null })
    .eq("event_id", id);
  return new Response(message, { status: 503 });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!webhookSecret || !supabaseUrl || !serviceRole) return new Response("Webhook not configured", { status: 503 });

  const expected = await hmacHex(webhookSecret, raw);
  if (!safeEqualHex(expected, signature)) return new Response("Invalid signature", { status: 401 });

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const hash = await sha256(raw);
  const id = await eventId(payload, raw);
  const eventName = String(payload?.event ?? "unknown");
  let surface = detectSurface(payload);
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { error: insertError } = await supabase.from("bridge_webhook_events").insert({
    event_id: id, event_name: eventName, payload_hash: hash, status: "received", attempts: 0,
  });
  if (insertError && String(insertError.code) !== "23505") return new Response("Persistence failure", { status: 503 });

  const { data: existing, error: readError } = await supabase.from("bridge_webhook_events")
    .select("status,payload_hash,processing_token,processing_started_at,attempts")
    .eq("event_id", id).maybeSingle();
  if (readError || !existing) return new Response("Persistence failure", { status: 503 });
  if (existing.payload_hash !== hash) return new Response("Event collision", { status: 409 });
  if (existing.status === "processed") return Response.json({ ok: true, duplicate: true });

  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const token = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.from("bridge_webhook_events")
    .update({
      status: "processing", processing_started_at: new Date().toISOString(),
      processing_token: token, attempts: Number(existing.attempts ?? 0) + 1,
    })
    .eq("event_id", id).eq("payload_hash", hash).neq("status", "processed")
    .or(`processing_token.is.null,processing_started_at.lt.${staleBefore}`)
    .select("event_id").maybeSingle();
  if (claimError) return new Response("Persistence failure", { status: 503 });
  if (!claimed) return Response.json({ ok: true, duplicate: true, in_progress: true });

  try {
    if (eventName === "payment.captured") {
      const payment = payload?.payload?.payment?.entity;
      if (!payment?.order_id || !payment?.id) return await failEvent(supabase, id, "Capture missing payment identifiers");
      if (String(payment.status ?? "").toLowerCase() !== "captured") {
        return await failEvent(supabase, id, "Razorpay payment is not captured");
      }

      const { data: localPayment, error: lookupError } = await supabase.from("bridge_payments")
        .select("id,user_id,title_id,purpose,provider,provider_order_id,provider_payment_id,package_id,amount_paise,currency,status")
        .eq("provider_order_id", payment.order_id).maybeSingle();
      if (lookupError) return await failEvent(supabase, id, "Bridge payment lookup failed");
      if (localPayment) surface = "bridge";

      if (surface === "bridge") {
        if (!localPayment) return await failEvent(supabase, id, "Bridge order not persisted yet");
        if (localPayment.provider !== "razorpay") return await failEvent(supabase, id, "Bridge payment provider mismatch");
        if (localPayment.provider_payment_id && localPayment.provider_payment_id !== payment.id) {
          return await failEvent(supabase, id, "Bridge order is linked to another payment");
        }

        const providerAmount = Number(payment.amount);
        const providerCurrency = String(payment.currency ?? "").toUpperCase();
        if (!Number.isSafeInteger(providerAmount) || providerAmount !== Number(localPayment.amount_paise)) {
          return await failEvent(supabase, id, "Payment amount mismatch");
        }
        if (providerCurrency !== String(localPayment.currency ?? "").toUpperCase()) {
          return await failEvent(supabase, id, "Payment currency mismatch");
        }

        // Other Bridge purposes may record a captured service payment, but cannot grant a title licence.
        if (localPayment.purpose !== "title_license") {
          const { error } = await supabase.from("bridge_payments").update({
            status: "captured", provider_payment_id: payment.id, verified_at: new Date().toISOString(),
          }).eq("id", localPayment.id);
          if (error) return await failEvent(supabase, id, "Bridge service payment capture record failed");
        } else {
          if (!localPayment.title_id) return await failEvent(supabase, id, "Bridge license order has no title");
          if (localPayment.currency !== "INR") return await failEvent(supabase, id, "Bridge license payment currency must be INR");

          if (localPayment.status !== "captured") {
            const { error: gateError } = await supabase.rpc("bridge_assert_buyer_publishable", {
              p_title_id: localPayment.title_id,
            });
            if (gateError) return await failEvent(supabase, id, "Buyer publication gate rejected captured payment");
          }

          let packageRecord: any = null;
          if (localPayment.package_id) {
            const { data, error } = await supabase.from("bridge_license_packages")
              .select("id,title_id,status,buyer_user_id")
              .eq("id", localPayment.package_id)
              .eq("title_id", localPayment.title_id)
              .maybeSingle();
            if (error || !data) return await failEvent(supabase, id, "Language licence package lookup failed");
            if (!["IN_NEGOTIATION", "LICENSED"].includes(data.status)) {
              return await failEvent(supabase, id, "Language licence package is not in active negotiation");
            }
            if (data.buyer_user_id && data.buyer_user_id !== localPayment.user_id) {
              return await failEvent(supabase, id, "Language licence package belongs to another buyer");
            }
            packageRecord = data;
          }

          const now = new Date().toISOString();
          const { data: updated, error: updateError } = await supabase.from("bridge_payments")
            .update({ status: "captured", provider_payment_id: payment.id, verified_at: now })
            .eq("id", localPayment.id).select("id").maybeSingle();
          if (updateError || !updated) return await failEvent(supabase, id, "Bridge payment update failed");

          if (packageRecord) {
            const { error: entitlementError } = await supabase.from("bridge_package_entitlements").upsert({
              package_id: packageRecord.id,
              title_id: localPayment.title_id,
              buyer_user_id: localPayment.user_id,
              payment_id: localPayment.id,
            }, { onConflict: "package_id,buyer_user_id", ignoreDuplicates: true });
            if (entitlementError) return await failEvent(supabase, id, "Bridge language package entitlement grant failed");

            const { error: packageUpdateError } = await supabase.from("bridge_license_packages").update({
              status: "LICENSED", buyer_user_id: localPayment.user_id, payment_id: localPayment.id, updated_at: now,
            }).eq("id", packageRecord.id);
            if (packageUpdateError) return await failEvent(supabase, id, "Bridge language package status update failed");
          } else {
            const { error: entitlementError } = await supabase.from("bridge_entitlements").upsert({
              user_id: localPayment.user_id, title_id: localPayment.title_id,
              payment_id: localPayment.id, access_type: "license",
            }, { onConflict: "user_id,title_id,access_type", ignoreDuplicates: true });
            if (entitlementError) return await failEvent(supabase, id, "Bridge entitlement grant failed");

            const { data: title, error: titleError } = await supabase.from("bridge_titles")
              .select("status").eq("id", localPayment.title_id).maybeSingle();
            if (titleError) return await failEvent(supabase, id, "Bridge title lookup failed");
            if (title && (title.status === "LIVE_FOR_BUYERS" || title.status === "IN_NEGOTIATION")) {
              const { error: transitionError } = await supabase.from("bridge_titles")
                .update({ status: "LICENSED", updated_at: now }).eq("id", localPayment.title_id);
              if (transitionError) return await failEvent(supabase, id, "Bridge title transition failed");
              const { error: eventError } = await supabase.from("bridge_title_events").insert({
                title_id: localPayment.title_id, from_status: title.status, to_status: "LICENSED",
                actor_user_id: localPayment.user_id, note: "razorpay captured webhook",
              });
              if (eventError) return await failEvent(supabase, id, "Bridge title event failed");
            }
          }

          const { error: auditError } = await supabase.from("bridge_audit_logs").insert({
            actor_user_id: localPayment.user_id,
            action: packageRecord ? "licensing.language_package_licensed" : "payment.captured",
            entity_type: packageRecord ? "bridge_license_package" : "bridge_payment",
            entity_id: packageRecord?.id ?? localPayment.id,
            metadata: { titleId: localPayment.title_id, paymentId: localPayment.id, source: "razorpay-webhook" },
          });
          if (auditError) return await failEvent(supabase, id, "Bridge audit write failed");

          const { data: profile } = await supabase.from("bridge_profiles")
            .select("email,email_verified").eq("user_id", localPayment.user_id).maybeSingle();
          if (profile?.email && profile.email_verified) {
            const { data: title } = await supabase.from("bridge_titles")
              .select("name").eq("id", localPayment.title_id).maybeSingle();
            const titleName = String(title?.name ?? "your licensed title");
            const subject = `Crayons Bridge licence payment confirmed: ${titleName}`;
            const { error: mailQueueError } = await supabase.from("bridge_notification_outbox").upsert({
              event_key: `bridge-license:${localPayment.id}`,
              recipient_email: profile.email,
              subject,
              text_body: `Payment received and licence entitlement recorded for ${titleName}. Payment reference: ${localPayment.id}. Open https://www.crayonspictures.in/buyer`,
              html_body: `<p>Payment received and licence entitlement recorded for <strong>${escapeHtml(titleName)}</strong>.</p><p>Payment reference: ${escapeHtml(localPayment.id)}</p><p><a href="https://www.crayonspictures.in/buyer">Open Bridge buyer workspace</a></p>`,
            }, { onConflict: "event_key", ignoreDuplicates: true });
            if (mailQueueError) return await failEvent(supabase, id, "Bridge licence email queue write failed");
          }
        }
      }
    }

    const { error: doneError } = await supabase.from("bridge_webhook_events").update({
      status: "processed", processed_at: new Date().toISOString(),
      processing_token: null, processing_started_at: null,
    }).eq("event_id", id).eq("processing_token", token);
    if (doneError) return new Response("Persistence failure", { status: 503 });
    return Response.json({ ok: true, event: eventName, surface });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected webhook failure";
    return await failEvent(supabase, id, message);
  }
});
