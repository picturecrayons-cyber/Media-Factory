import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/razorpay-webhook/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("external Razorpay function disables Supabase gateway JWT verification", () => {
  assert.match(config, /\[functions\.razorpay-webhook\][\s\S]*verify_jwt\s*=\s*false/);
});

test("Razorpay delivery ID is the canonical webhook idempotency key", () => {
  assert.match(source, /async function eventId\\(payload: any, raw: string, providerEventId\\?: string \\| null\\)/);
  assert.match(source, /req\\.headers\\.get\\("x-razorpay-event-id"\\)/);
  assert.match(source, /return `razorpay:\\$\\{deliveryId\\}`/);
  assert.match(source, /deliveryId\\.length <= 255/);
});

test("fallback event ID awaits the body hash when no provider ID is present", () => {
  assert.match(source, /`\\$\\{e\\}:\\$\\{await sha256\\(raw\\)\\}`/);
  assert.doesNotMatch(source, /\\$\\{awaitHash\\(raw\\)\\}/);
});

test("captured Bridge payment is resolved from provider_order_id, not only notes", () => {
  assert.match(source, /from\("bridge_payments"\)[\s\S]*eq\("provider_order_id", payment\.order_id\)/);
  assert.match(source, /if \(localPayment\) surface = "bridge"/);
});

test("webhook deliveries are atomically claimed before side effects", () => {
  assert.match(source, /update\(\{ status: "processing" \}\)/);
  assert.match(source, /\.in\("status", \["received", "failed"\]\)/);
  assert.match(source, /if \(!claimed\) return new Response\("Event is already processing", \{ status: 503 \}\)/);
});

test("unmatched Bridge capture remains retriable", () => {
  assert.match(source, /if \(!localPayment\) return await failEvent\(supabase, id, "Bridge order not persisted yet"\)/);
  assert.match(source, /new Response\(message, \{ status: 503 \}\)/);
});

test("entitlement and title transition happen before webhook is marked processed", () => {
  const entitlement = source.indexOf('from("bridge_entitlements").upsert');
  const transition = source.indexOf('from("bridge_titles").update');
  const processed = source.indexOf('status: "processed"');
  assert.ok(entitlement >= 0 && transition >= 0 && processed >= 0);
  assert.ok(entitlement < processed);
  assert.ok(transition < processed);
});
