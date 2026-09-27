import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function eventId(payload: any, raw: string) {
  const e = payload?.event ?? "unknown";
  const p = payload?.payload?.payment?.entity;
  const o = payload?.payload?.order?.entity;
  const r = payload?.payload?.refund?.entity;
  const s = payload?.payload?.subscription?.entity;
  return (
    (p?.id && `${e}:${p.id}`) ||
    (o?.id && `${e}:${o.id}`) ||
    (r?.id && `${e}:${r.id}`) ||
    (s?.id && `${e}:${s.id}`) ||
    `${e}:${awaitHash(raw)}`
  );
}

async function awaitHash(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";

  if (!webhookSecret || !supabaseUrl || !serviceRole) {
    console.error("Missing required webhook environment variables");
    return new Response("Webhook not configured", { status: 503 });
  }

  const expected = await hmacHex(webhookSecret, raw);
  if (!safeEqualHex(expected, signature)) return new Response("Invalid signature", { status: 401 });

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const hash = await awaitHash(raw);
  const id = await eventId(payload, raw);
  const eventName = String(payload?.event ?? "unknown");
  const surface = detectSurface(payload);
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { error: insertError } = await supabase.from("bridge_webhook_events").insert({
    event_id: id,
    event_name: eventName,
    payload_hash: hash,
    status: "received",
  });

  if (insertError && !String(insertError.code).includes("23505")) {
    console.error("Webhook audit insert failed", insertError.message);
    return new Response("Persistence failure", { status: 503 });
  }

  const { data: existing, error: readError } = await supabase
    .from("bridge_webhook_events")
    .select("status,payload_hash")
    .eq("event_id", id)
    .maybeSingle();

  if (readError || !existing) return new Response("Persistence failure", { status: 503 });
  if (existing.payload_hash !== hash) return new Response("Event collision", { status: 409 });
  if (existing.status === "processed") return Response.json({ ok: true, duplicate: true });

  if (eventName === "payment.captured") {
    const payment = payload?.payload?.payment?.entity;
    if (surface === "bridge" && payment?.order_id && payment?.id) {
      const { error } = await supabase
        .from("bridge_payments")
        .update({ status: "captured", provider_payment_id: payment.id, verified_at: new Date().toISOString() })
        .eq("provider_order_id", payment.order_id);
      if (error) {
        console.error("Bridge payment update failed", error.message);
        await supabase.from("bridge_webhook_events").update({ status: "failed" }).eq("event_id", id);
        return new Response("Bridge payment update failed", { status: 503 });
      }
    }
  }

  const { error: doneError } = await supabase
    .from("bridge_webhook_events")
    .update({ status: "processed", processed_at: new Date().toISOString() })
    .eq("event_id", id);
  if (doneError) return new Response("Persistence failure", { status: 503 });

  return Response.json({ ok: true, event: eventName, surface });
});
