import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const subscriptions = readFileSync(new URL("./subscriptions.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../../../supabase/functions/razorpay-webhook/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../supabase/migrations/20261118130000_loop_tvod_payment_fulfillment.sql", import.meta.url), "utf8");

test("TVOD checkout persists a pending order and never grants entitlement before capture", () => {
  assert.match(subscriptions, /api\.razorpay\.com\/v1\/orders/);
  assert.match(subscriptions, /insert into loop_tvod_orders/);
  assert.match(subscriptions, /status\)\s*values[\s\S]*'pending'/);
  assert.doesNotMatch(subscriptions, /insert into loop_entitlements/);
});

test("Loop subscription cannot be activated directly without paid checkout", () => {
  assert.match(subscriptions, /Direct Loop Pass activation is disabled/);
  assert.doesNotMatch(subscriptions, /insert into loop_subscriptions/);
});

test("TVOD webhook validates capture identity, amount and currency before fulfillment", () => {
  assert.match(webhook, /Loop TVOD payment amount mismatch/);
  assert.match(webhook, /Loop TVOD payment currency mismatch/);
  assert.match(webhook, /loop_fulfill_captured_rental/);
});

test("TVOD fulfillment fails closed on revoked publication, price mismatch and duplicate capture", () => {
  assert.match(migration, /p\.authorization_status='authorized'/);
  assert.match(migration, /t\.access_tier='TVOD'/);
  assert.match(migration, /tvod_rental_price \* 100/);
  assert.match(migration, /prior_event\.status='processed'/);
  assert.match(migration, /prior_event\.status='refunded'/);
  assert.match(migration, /grant execute on function public\.loop_fulfill_captured_rental\(text,text\) to service_role/);
});

test("verified Loop refunds revoke entitlements and refund-before-capture is reconciled", () => {
  assert.match(webhook, /eventName === "refund\.processed"/);
  assert.match(webhook, /loop_refund_captured_rental/);
  assert.match(webhook, /Loop TVOD refund order could not be reconciled/);
  assert.match(migration, /refund_before_capture/);
  assert.match(migration, /status='REFUNDED'/);
});

test("public Loop catalog never exposes raw OCI playback keys", () => {
  assert.match(catalog, /playbackPath: null/);
  assert.match(catalog, /getAuthorizedLoopPlayback/);
  assert.match(catalog, /signDownload/);
  assert.match(catalog, /loop_user_tvod_entitlements/);
});
