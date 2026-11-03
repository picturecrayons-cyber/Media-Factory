import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/razorpay-webhook/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("external Razorpay function disables Supabase gateway JWT verification", () => {
  assert.match(config, /\[functions\.razorpay-webhook\][\s\S]*verify_jwt\s*=\s*false/);
});

test("fallback event ID awaits the body hash", () => {
  assert.match(source, /`\$\{e\}:\$\{await sha256\(raw\)\}`/);
  assert.doesNotMatch(source, /\$\{awaitHash\(raw\)\}/);
});

test("captured Bridge payment is resolved from provider_order_id, not only notes", () => {
  assert.match(source, /from\("bridge_payments"\)[\s\S]*eq\("provider_order_id", payment\.order_id\)/);
  assert.match(source, /if \(localPayment\) surface = "bridge"/);
});

test("unmatched Bridge capture remains retriable", () => {
  assert.match(source, /if \(!localPayment\) return await failEvent\(supabase, id, claimToken, "Bridge order not persisted yet"\)/);
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

test("webhook processing uses an atomic lease claim", () => {
  assert.match(source, /processing_token: claimToken/);
  assert.match(source, /status.eq.received,status.eq.failed/);
  assert.match(source, /Webhook event is already processing/);
});

test("captured payment is fetched from Razorpay and checked against order, amount and currency", () => {
  assert.match(source, /api.razorpay.com\/v1\/payments/);
  assert.match(source, /verified.status !== "captured"/);
  assert.match(source, /verified.order_id !== payment.order_id/);
  assert.match(source, /verified.amount !== localPayment.amount_paise/);
  assert.match(source, /verified.currency !== localPayment.currency/);
});

test("webhook completion requires the current lease token", () => {
  assert.match(source, /eq\("processing_token", claimToken\)/);
});
