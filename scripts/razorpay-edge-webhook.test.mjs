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


test("webhook processing uses a durable lease and only marks its own attempt processed", () => {
  assert.match(source, /processing_token/);
  assert.match(source, /processing_started_at/);
  assert.match(source, /eq\("processing_token", token\)/);
});

test("captured webhook checks provider amount and currency before granting access", () => {
  assert.match(source, /Payment amount mismatch/);
  assert.match(source, /Payment currency mismatch/);
  assert.match(source, /Number\(localPayment\.amount_paise\)/);
});

test("accepted deal payments create scoped entitlements, not title-wide grants", () => {
  assert.match(source, /from\("bridge_license_deals"\)/);
  assert.match(source, /from\("bridge_deal_entitlements"\)/);
  assert.match(source, /deal\.agreed_fee_paise/);
  assert.match(source, /licensing\.deal_payment_captured/);
});
