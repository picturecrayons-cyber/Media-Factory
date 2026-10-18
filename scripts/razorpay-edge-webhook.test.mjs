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

test("Bridge captures validate provider amount, currency, and captured status before granting access", () => {
  assert.match(source, /payment\.status !== "captured"/);
  assert.match(source, /Number\(payment\.amount\) !== Number\(localPayment\.amount_paise\)/);
  assert.match(source, /payment\.currency !== localPayment\.currency \|\| localPayment\.currency !== "INR"/);
});

test("package payments grant package entitlement and license the package instead of a generic title entitlement", () => {
  assert.match(source, /if \(localPayment\.package_id\)/);
  assert.match(source, /from\("bridge_package_entitlements"\)\.upsert/);
  assert.match(source, /action: "licensing\.language_package_licensed"/);
  assert.match(source, /from\("bridge_license_packages"\)\.update\(\{[\s\S]*status: "LICENSED"/);
});

test("edge webhook atomically claims events and rejects concurrent in-flight delivery", () => {
  assert.match(source, /status: "processing"/);
  assert.match(source, /processing_token: claimToken/);
  assert.match(source, /status\.in\.\(received,failed\),and\(status\.eq\.processing,processing_started_at\.lt/);
  assert.match(source, /if \(!claimed\) return new Response\("Webhook event is already processing", \{ status: 503 \}\)/);
});

test("edge webhook completion and failure updates are guarded by the active lease token", () => {
  assert.match(source, /\.eq\("processing_token", claimToken\)/);
  assert.match(source, /update\(\{ status: "failed", processing_started_at: null, processing_token: null \}\)/);
  assert.match(source, /attempts: \(existing\.attempts \?\? 0\) \+ 1/);
});
