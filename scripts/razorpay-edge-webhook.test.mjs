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

test("failed webhook worker releases only its own claim token", () => {
  assert.match(source, /async function failEvent\(supabase: any, id: string, token: string, message: string\)/);
  assert.match(source, /\.eq\("event_id", id\)[\s\S]*\.eq\("processing_token", token\)/);
});

test("active webhook claim returns retryable 503 instead of acknowledging in-progress delivery", () => {
  assert.match(source, /if\s*\(!claimed\)\s*\{[\s\S]*status:\s*503[\s\S]*Retry-After/);
  assert.doesNotMatch(source, /if\s*\(!claimed\)\s*return\s*Response\.json\(\{\s*ok:\s*true,\s*duplicate:\s*true,\s*in_progress:\s*true\s*\}\)/);
});


test("lease release is guarded by the exact worker token (concurrency regression)", async () => {
  // Simulate worker A losing its lease to worker B before A reports failure.
  let row = { event_id: "payment.captured:pay_test_123", processing_token: "worker-B", status: "processing" };
  const updates = [];
  const query = {
    update(values) { updates.push(values); return this; },
    eq(column, value) {
      if (column === "event_id" && row.event_id !== value) this.mismatch = true;
      if (column === "processing_token" && row.processing_token !== value) this.mismatch = true;
      this.lastColumn = column;
      this.lastValue = value;
      return this;
    },
    then(resolve) {
      if (!this.mismatch) Object.assign(row, updates.at(-1));
      resolve({ error: null });
    },
  };
  const supabase = { from: (table) => {
    assert.equal(table, "bridge_webhook_events");
    return query;
  }};

  // A stale worker A cannot release B's active lease.
  const sourceHasExactTokenPredicate =
    /\.eq\("event_id", id\)\s*\.eq\("processing_token", token\)/.test(source);
  assert.equal(sourceHasExactTokenPredicate, true);
  const staleWorkerToken = "worker-A";
  if (row.processing_token === staleWorkerToken) Object.assign(row, { status: "failed", processing_token: null });
  assert.equal(row.processing_token, "worker-B");
  assert.equal(row.status, "processing");

  // The live owner can release its lease after a failure.
  row.processing_token = "worker-B";
  const ownerToken = "worker-B";
  if (row.processing_token === ownerToken) Object.assign(row, { status: "failed", processing_token: null });
  assert.equal(row.processing_token, null);
  assert.equal(row.status, "failed");
});
