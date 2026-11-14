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
  assert.match(source, /from\("bridge_payments"\)[\s\S]*eq\("provider_order_id",\s*payment\.order_id\)/);
  assert.match(source, /if\s*\(\s*localPayment\s*\)\s*surface\s*=\s*"bridge"/);
});

test("unmatched Bridge capture remains retriable", () => {
  assert.match(source, /if\s*\(\s*!localPayment\s*\)\s*return\s*await failEvent\(supabase,id,"Bridge order not persisted yet"\)/);
  assert.match(source, /new Response\(message,\s*\{\s*status:\s*503\s*\}\)/);
});

test("ordinary and package entitlements happen before webhook is marked processed", () => {
  const entitlement = source.indexOf('from("bridge_entitlements")');
  const packageEntitlement = source.indexOf('from("bridge_package_entitlements")');
  const titleUpdate = source.indexOf('.update({ status: "LICENSED"');
  const processed = source.search(/status\s*:\s*"processed"/);
  assert.ok(entitlement >= 0 && packageEntitlement >= 0 && titleUpdate >= 0 && processed >= 0);
  assert.ok(entitlement < processed);
  assert.ok(packageEntitlement < processed);
  assert.ok(titleUpdate < processed);
  assert.match(source, /bridge_assert_buyer_publishable/);
  assert.match(source, /localPayment\.purpose !== "title_license"/);
});


test("Bridge capture validates the persisted provider, exact amount, and currency", () => {
  assert.match(source, /provider\s*!==\s*["']razorpay["']/);
  assert.match(source, /providerAmount[\s\S]*localPayment\.amount_paise/);
  assert.match(source, /providerCurrency[\s\S]*localPayment\.currency/);
});

test("webhook event processing uses a claim token and stale-processing guard", () => {
  assert.match(source, /processing_token/);
  assert.match(source, /processing_started_at/);
  assert.match(source, /processing_token[\s\S]*processing_started_at/);
});
