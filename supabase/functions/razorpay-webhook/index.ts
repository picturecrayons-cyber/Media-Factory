import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const LEASE_SECONDS = 120;

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
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

async function failEvent(supabase: any, id: string, token: string, message: string) {
  console.error(message);
  await supabase.from("bridge_webhook_events").update({
    status: "failed", processing_started_at: null, processing_token: null,
  }).eq("event_id", id).eq("processing_token", token);
  return new Response(message, { status: 503 });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!webhookSecret || !keyId || !keySecret || !supabaseUrl || !serviceRole) return new Response("Webhook not configured", { status: 503 });
  const expected = await hmacHex(webhookSecret, raw);
  if (!safeEqualHex(expected, signature)) return new Response("Invalid signature", { status: 401 });

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const hash = await sha256(raw);
  const id = await eventId(payload, raw);
  const eventName = String(payload?.event ?? "unknown");
  let surface = detectSurface(payload);
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { error: insertError } = await supabase.from("bridge_webhook_events")
    .insert({ event_id: id, event_name: eventName, payload_hash: hash, status: "received" });
  if (insertError && String(insertError.code) !== "23505") return new Response("Persistence failure", { status: 503 });

  const { data: existing, error: readError } = await supabase.from("bridge_webhook_events")
    .select("status,payload_hash,attempts").eq("event_id", id).maybeSingle();
  if (readError || !existing) return new Response("Persistence failure", { status: 503 });
  if (existing.payload_hash !== hash) return new Response("Event collision", { status: 409 });
  if (existing.status === "processed") return Response.json({ ok: true, duplicate: true });

  const claimToken = crypto.randomUUID();
  const now = new Date();
  const leaseExpiredAt = new Date(now.getTime() - LEASE_SECONDS * 1000).toISOString();
  const { data: claimed, error: claimError } = await supabase.from("bridge_webhook_events")
    .update({
      status: "processing", processing_started_at: now.toISOString(),
      processing_token: claimToken,
      attempts: (existing.attempts ?? 0) + 1,
    })
    .eq("event_id", id)
    .or(`status.eq.received,status.eq.failed,and(status.eq.processing,processing_started_at.lt.${leaseExpiredAt})`)
    .select("event_id").maybeSingle();
  if (claimError) return new Response("Webhook claim failed", { status: 503 });
  if (!claimed) return new Response("Webhook event is already processing", { status: 503 });

  try {
    if (eventName === "payment.captured") {
      const payment = payload?.payload?.payment?.entity;
      if (!payment?.order_id || !payment?.id) return await failEvent(supabase, id, claimToken, "Capture missing payment identifiers");

      const { data: localPayment, error: lookupError } = await supabase.from("bridge_payments")
        .select("id,user_id,title_id,purpose,status,provider_payment_id,amount_paise,currency")
        .eq("provider_order_id", payment.order_id).maybeSingle();
      if (lookupError) return await failEvent(supabase, id, claimToken, "Bridge payment lookup failed");
      if (localPayment) surface = "bridge";

      // An order may be captured before the Bridge payment row is committed,
      // and Razorpay does not reliably copy order notes onto payment entities.
      // Never acknowledge an unclassified capture as processed: return 503 so
      // the provider retries after the authoritative local order row is visible.
      if (surface === "unknown") {
        return await failEvent(
          supabase,
          id,
          claimToken,
          "Captured payment surface is unresolved; retry after order persistence",
        );
      }

      if (surface === "bridge") {
        // CRA-165 remains a hard fulfillment gate. Do not call Razorpay,
        // update Bridge payment state, grant entitlements, or transition titles
        // until organization, mandate and exact-rights authorization share one
        // canonical server transaction.
        return await failEvent(
          supabase,
          id,
          claimToken,
          "Bridge payment fulfillment blocked: CRA-165 mandate authorization is not implemented",
        );
      }
    }

    const { data: completed, error: doneError } = await supabase.from("bridge_webhook_events").update({
      status: "processed", processed_at: new Date().toISOString(),
      processing_started_at: null, processing_token: null,
    }).eq("event_id", id).eq("processing_token", claimToken).select("event_id").maybeSingle();
    if (doneError || !completed) return new Response("Webhook completion lease lost", { status: 503 });
    return Response.json({ ok: true, event: eventName, surface });
  } catch (error) {
    console.error("Webhook processing failed", error instanceof Error ? error.message : "unknown error");
    return await failEvent(supabase, id, claimToken, "Webhook processing failed");
  }
});
