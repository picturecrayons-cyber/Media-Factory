import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/razorpay-webhook/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("external Razorpay function disables Supabase gateway JWT verification", () => {
  assert.match(config, /\[functions\.razorpay-webhook\][\s\S]*verify_jwt\s*=\s*false/);
});

test("fallback event ID awaits the body hash", () => {
  assert.match(source, /\$\{event\}:\$\{await sha256\(raw\)\}/);
  assert.match(source, /\$\{event\}:\$\{payment\.id\}/);
  assert.doesNotMatch(source, /\$\{awaitHash\(raw\)\}/);
});

test("captured Bridge payment is resolved from provider_order_id, not only notes", () => {
  assert.match(source, /from\("bridge_payments"\)[\s\S]*eq\("provider_order_id",\s*payment\.order_id\)/);
  assert.match(source, /if\s*\(\s*localPayment\s*\)\s*surface\s*=\s*"bridge"/);
});

test("unmatched Bridge capture remains retriable", () => {
  assert.match(source, /if\s*\(\s*!localPayment\s*\)\s*return\s*await failEvent\(supabase,\s*id,\s*token,\s*"Bridge order not persisted yet"\)/);
  assert.match(source, /new Response\(message,\s*\{\s*status:\s*503,\s*headers:\s*\{\s*"Retry-After":\s*"30"\s*\}\s*\}\)/);
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


test("active webhook lease returns retryable 503 instead of acknowledging in-progress work", () => {
  assert.match(source, /if\s*\(\s*!claimed\s*\)\s*return new Response\([\s\S]*?status:\s*503/);
  assert.match(source, /Retry-After/);
  assert.doesNotMatch(source, /in_progress:\s*true/);
});

test("failed webhook worker can release only its own processing lease", () => {
  const fail = source.match(/async function failEvent\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fail, /\.eq\("event_id",\s*id\)[\s\S]*\.eq\("processing_token",\s*token\)/);
});

test("webhook completion must update the row still owned by the same claim token", () => {
  assert.match(source, /\.eq\("event_id",\s*id\)\.eq\("processing_token",\s*token\)\.select\("event_id"\)\.maybeSingle\(\)/);
  assert.match(source, /if\s*\(\s*doneError\s*\|\|\s*!finalized\s*\)/);
});


test("webhook finalization is conditional on the same active claim token", () => {
  assert.ok(source.includes('.eq("event_id", id).eq("processing_token", token).select("event_id").maybeSingle()'));
  assert.match(source, /if\s*\(\s*doneError\s*\|\|\s*!finalized\s*\)/);
  assert.match(source, /Webhook processing lease was lost/);
});

test("failed webhook worker logs claim-release persistence failures", () => {
  assert.match(source, /const \{ error \} = await supabase\.from\("bridge_webhook_events"\)/);
  assert.match(source, /Failed to release webhook claim/);
});

test("license package reservation is atomic and cannot be reassigned to another buyer", async () => {
  const paymentSource = await readFile(new URL("../src/lib/bridge/payments.ts", import.meta.url), "utf8");
  const start = paymentSource.indexOf("export const createLicenseOrder");
  const end = paymentSource.indexOf("export const verifyLicensePayment", start);
  const orderHandler = paymentSource.slice(start, end);
  const reserve = orderHandler.indexOf("update bridge_license_packages");
  const createOrder = orderHandler.indexOf('razorpayFetch<{ id: string; amount: number; currency: string }>');
  assert.ok(reserve >= 0 && createOrder > reserve, "package must be reserved before provider order creation");
  assert.match(orderHandler, /and \(buyer_user_id is null or buyer_user_id = \$\{actor\.userId\}\)/);
  assert.match(orderHandler, /returning id, title_id, price_paise, status, buyer_user_id/);
  assert.match(orderHandler, /License package is reserved by another buyer or is not available/);
  assert.doesNotMatch(orderHandler, /set status = 'IN_NEGOTIATION', buyer_user_id = \$\{actor\.userId\}/);
});

test("webhook stale lease outlives Supabase's maximum Edge Function worker duration", () => {
  assert.match(source, /Date\.now\(\) - 10 \* 60 \* 1000/);
  assert.match(source, /hard 400s wall-clock maximum/);
});
