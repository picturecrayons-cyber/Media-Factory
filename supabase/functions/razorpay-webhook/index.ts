import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sha256(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function eventId(payload: any, raw: string) {
  const e = payload?.event ?? "unknown";
  const p = payload?.payload?.payment?.entity;
  const o = payload?.payload?.order?.entity;
  const r = payload?.payload?.refund?.entity;
  const s = payload?.payload?.subscription?.entity;
  return (p?.id && `${e}:${p.id}`) || (o?.id && `${e}:${o.id}`) || (r?.id && `${e}:${r.id}`) ||
    (s?.id && `${e}:${s.id}`) || `${e}:${await sha256(raw)}`;
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

async function failEvent(supabase: any, id: string, message: string, claimToken?: string) {
  console.error(message);
  let update = supabase.from("bridge_webhook_events")
    .update({ status: "failed", processing_started_at: null, processing_token: null })
    .eq("event_id", id);
  if (claimToken) update = update.eq("processing_token", claimToken);
  const { error } = await update;
  if (error) console.error("Failed to persist webhook failure state");
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

  const { error: insertError } = await supabase.from("bridge_webhook_events").insert({ event_id: id, event_name: eventName, payload_hash: hash, status: "received" });
  if (insertError && String(insertError.code) !== "23505") return new Response("Persistence failure", { status: 503 });
  const { data: existing, error: readError } = await supabase.from("bridge_webhook_events").select("status,payload_hash,attempts").eq("event_id", id).maybeSingle();
  if (readError || !existing) return new Response("Persistence failure", { status: 503 });
  if (existing.payload_hash !== hash) return new Response("Event collision", { status: 409 });
  if (existing.status === "processed") return Response.json({ ok: true, duplicate: true });

  // Atomically claim the event. Only one concurrent delivery can own the lease;
  // failed deliveries and abandoned leases are retriable.
  const claimToken = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await supabase.from("bridge_webhook_events")
    .update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      processing_token: claimToken,
      attempts: (existing.attempts ?? 0) + 1,
    })
    .eq("event_id", id)
    .or(`status.in.(received,failed),and(status.eq.processing,processing_started_at.lt.${staleBefore})`)
    .select("event_id")
    .maybeSingle();
  if (claimError) return new Response("Webhook claim failed", { status: 503 });
  if (!claimed) return new Response("Webhook event is already processing", { status: 503 });

  if (eventName === "payment.captured") {
    const payment = payload?.payload?.payment?.entity;
    if (!payment?.order_id || !payment?.id) return await failEvent(supabase, id, "Capture missing payment identifiers", claimToken);

    // The local provider_order_id is authoritative for Bridge. Razorpay payment webhooks do not reliably copy order notes.
    const { data: localPayment, error: lookupError } = await supabase.from("bridge_payments")
      .select("id,user_id,title_id,purpose,status,provider_payment_id")
      .eq("provider_order_id", payment.order_id).maybeSingle();
    if (lookupError) return await failEvent(supabase, id, "Bridge payment lookup failed", claimToken);
    if (localPayment) surface = "bridge";

    if (surface === "bridge") {
      // A capture can race the local insert after Razorpay order creation. Return 503 so Razorpay retries it.
      if (!localPayment) return await failEvent(supabase, id, "Bridge order not persisted yet", claimToken);
      if (localPayment.provider_payment_id && localPayment.provider_payment_id !== payment.id) {
        return new Response("Order linked to another payment", { status: 409 });
      }
      if (!localPayment.title_id) return await failEvent(supabase, id, "Bridge license order has no title", claimToken);

      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase.from("bridge_payments")
        .update({ status: "captured", provider_payment_id: payment.id, verified_at: now })
        .eq("id", localPayment.id).select("id").maybeSingle();
      if (updateError || !updated) return await failEvent(supabase, id, "Bridge payment update failed", claimToken);

      const { error: entitlementError } = await supabase.from("bridge_entitlements").upsert({
        user_id: localPayment.user_id, title_id: localPayment.title_id, payment_id: localPayment.id, access_type: "license",
      }, { onConflict: "user_id,title_id,access_type", ignoreDuplicates: true });
      if (entitlementError) return await failEvent(supabase, id, "Bridge entitlement grant failed", claimToken);

      const { data: title, error: titleError } = await supabase.from("bridge_titles").select("status").eq("id", localPayment.title_id).maybeSingle();
      if (titleError) return await failEvent(supabase, id, "Bridge title lookup failed", claimToken);
      if (title && (title.status === "LIVE_FOR_BUYERS" || title.status === "IN_NEGOTIATION")) {
        const { error: transitionError } = await supabase.from("bridge_titles").update({ status: "LICENSED", updated_at: now }).eq("id", localPayment.title_id);
        if (transitionError) return await failEvent(supabase, id, "Bridge title transition failed", claimToken);
        const { error: eventError } = await supabase.from("bridge_title_events").insert({
          title_id: localPayment.title_id, from_status: title.status, to_status: "LICENSED", actor_user_id: localPayment.user_id, note: "razorpay captured webhook",
        });
        if (eventError) return await failEvent(supabase, id, "Bridge title event failed", claimToken);
      }
      const { error: auditError } = await supabase.from("bridge_audit_logs").insert({
        actor_user_id: localPayment.user_id, action: "payment.captured", entity_type: "bridge_payment", entity_id: localPayment.id,
        metadata: JSON.stringify({ titleId: localPayment.title_id, source: "razorpay-webhook" }),
      });
      if (auditError) return await failEvent(supabase, id, "Bridge audit write failed", claimToken);
    }
  }

  const { data: completed, error: doneError } = await supabase.from("bridge_webhook_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      processing_token: null,
    })
    .eq("event_id", id)
    .eq("processing_token", claimToken)
    .select("event_id")
    .maybeSingle();
  if (doneError || !completed) return new Response("Persistence failure", { status: 503 });
  return Response.json({ ok: true, event: eventName, surface });
});
