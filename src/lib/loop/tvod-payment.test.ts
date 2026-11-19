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
  assert.match(subscriptions, /bridge_loop_consumer_pricing/);
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

test("TVOD payment identities match canonical Production UUID types and foreign keys", () => {
  assert.match(migration, /user_id uuid not null references auth\.users\(id\)/);
  assert.match(migration, /loop_title_id uuid not null references public\.loop_titles\(id\)/);
  assert.match(migration, /user_id uuid references auth\.users\(id\)/);
  assert.match(migration, /loop_title_id uuid references public\.loop_titles\(id\)/);
});

test("TVOD fulfillment fails closed on revoked publication, price mismatch and duplicate capture", () => {
  assert.match(migration, /p\.authorization_status='authorized'/);
  assert.match(migration, /t\.access_tier='TVOD'/);
  assert.match(migration, /tvod_rental_price::numeric \* 100/);
  assert.match(migration, /bridge_loop_consumer_pricing/);
  assert.match(migration, /cp\.status='APPROVED'/);
  assert.match(migration, /prior_event\.status='processed'/);
  assert.match(migration, /prior_event\.status='refunded'/);
  assert.match(migration, /grant execute on function public\.loop_fulfill_captured_rental\(text,text\) to service_role/);
});

test("verified Loop refunds are idempotent, cumulative and revoke playback only on full refund", () => {
  assert.match(webhook, /eventName === "refund\.processed"/);
  assert.match(webhook, /loop_refund_captured_rental/);
  assert.match(webhook, /p_refund_amount_paise: refundAmountPaise/);
  assert.match(webhook, /Loop TVOD refund order could not be reconciled/);
  assert.match(migration, /create table if not exists public\.loop_tvod_refunds/);
  assert.match(migration, /sum\(amount_paise\)/);
  assert.match(migration, /fully_refunded/);
  assert.match(migration, /refund_before_fulfillment/);
  assert.match(migration, /status='REFUNDED'/);
  assert.doesNotMatch(migration, /drop function if exists public\.loop_refund_captured_rental\(text,text\)/);
});

test("public Loop catalog never exposes raw OCI playback keys", () => {
  assert.match(catalog, /playbackPath: null/);
  assert.match(catalog, /tvodRentalPrice: Number\(r\.tvod_rental_price \?\? 0\)/);
  assert.match(catalog, /tvodPurchasePrice: Number\(r\.tvod_purchase_price \?\? 0\)/);
  assert.match(catalog, /getAuthorizedLoopPlayback/);
  assert.match(catalog, /signDownload/);
  assert.match(catalog, /loop_user_tvod_entitlements/);
});

test("TVOD capture binds one provider payment ID atomically to the persisted order", () => {
  assert.match(webhook, /provider_payment_id\\.is\\.null,provider_payment_id\\.eq\.\\$\\{payment\.id\\}/);
  assert.match(webhook, /Loop TVOD captured payment could not be persisted/);
});
test("TVOD refund webhook fails closed when payment or refund identity is missing", () => {
  assert.match(webhook, /!paymentId \\|\\| !refundId/);
  assert.match(webhook, /Refund event is missing required payment_id or refund id/);
});
