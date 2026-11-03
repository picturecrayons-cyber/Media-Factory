import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/razorpay-webhook/index.ts", import.meta.url), "utf8");
const payments = await readFile(new URL("../src/lib/bridge/payments.ts", import.meta.url), "utf8");
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

test("Bridge webhook capture fails closed before any payment or entitlement mutation", () => {
  const start = source.indexOf('if (surface === "bridge")');
  const end = source.indexOf("\n      }", start);
  assert.ok(start >= 0 && end > start, "Bridge surface guard must exist");
  const block = source.slice(start, end);
  assert.match(block, /failEvent/);
  assert.match(block, /CRA-165/);
  assert.doesNotMatch(source, /fetchVerifiedRazorpayPayment/);
  assert.doesNotMatch(source, /bridge_entitlements|bridge_package_entitlements/);
  assert.doesNotMatch(source, /from\("bridge_titles"\)\.update/);
});

test("Buyer license order is blocked before any Razorpay order request", () => {
  const start = payments.indexOf("export const createLicenseOrder");
  const end = payments.indexOf("export const verifyLicensePayment", start);
  const handler = payments.slice(start, end);
  const guard = handler.indexOf("assertBuyerLicenseOrderBlocked(actor)");
  const providerOrder = handler.indexOf('razorpayFetch<{ id: string; amount: number; currency: string }>("/orders"');
  assert.ok(guard >= 0 && providerOrder > guard);
});

test("captured Bridge license fulfillment is blocked before Razorpay lookup or entitlement mutation", () => {
  const start = payments.indexOf("export async function grantFromCapturedPayment");
  const end = payments.indexOf("export const getCheckoutConfig", start);
  const handler = payments.slice(start, end);
  assert.match(handler, /BRIDGE_LICENSE_FULFILLMENT_BLOCKED/);
  assert.doesNotMatch(handler, /razorpayFetch|bridge_entitlements|bridge_package_entitlements|recordTransition/);
});

test("webhook processing uses an atomic lease claim", () => {
  assert.match(source, /processing_token: claimToken/);
  assert.match(source, /status.eq.received,status.eq.failed/);
  assert.match(source, /Webhook event is already processing/);
});

test("webhook completion requires the current lease token", () => {
  assert.match(source, /eq\("processing_token", claimToken\)/);
});
