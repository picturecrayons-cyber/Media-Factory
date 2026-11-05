# CRA-165 — Canonical payment-to-entitlement fulfillment contract

**Status:** Source contract + regression tests; runtime adapter intentionally not wired  
**Parent implementation:** PR #475 exact head `d2f5af036dc8236fd7b7e95edf0b27ca4ee74ea1`  
**Production:** HOLD / NOT CERTIFIED / NO-GO

## Decision and scope

Bridge must have one fulfillment writer. Razorpay's server-side capture record is evidence of payment, not authority to grant a license. A successful entitlement requires all of the following to be true in the same canonical operation:

1. The persisted Bridge payment order identifies one immutable acting user, legal Buyer organization, title, optional package, rights grant and mandate.
2. Razorpay's server API confirms the exact payment ID belongs to the exact order ID, is `captured`, and matches the persisted integer amount in paise and currency.
3. The current Buyer membership and legal organization are active.
4. The active mandate chain is explicit and ordered from rights principal through every intermediary to the transaction Buyer. No cycles, missing links, inactive links, expired links or delegation overreach.
5. The grant matches the exact title, package, territory, language, exploitation model, asset kinds and bounded rights window. Rights window must be contained within the mandate window and must not be revoked.
6. Payment state, entitlement creation and immutable audit write commit atomically. Any failure rolls back all local writes.

The implementation adds a pure policy plus adapter-driven transaction service at `src/lib/bridge/canonical-fulfillment.ts`. It deliberately does not connect to the current DB: CRA-128/138 have not certified a Preview + private OCI boundary or a canonical persisted schema. It is not a production-ready adapter and does not enable checkout.

## Canonical transaction contract

The eventual repository adapter must implement these methods against one database transaction:

- `lockPaymentByProviderOrderId`: select the exact payment row FOR UPDATE; reject absent/ambiguous rows.
- `findEntitlementByProviderPaymentId`: check idempotency under the same transaction.
- `loadAuthorization`: load current user membership, legal organization, rights principal, complete mandate chain, grant dimensions and revocation state; no email/display-name/client-org fallback.
- `markPaymentCaptured`: conditional state transition tied to the exact provider payment/order/amount/currency.
- `insertEntitlement`: persist payment record, provider payment, user, Buyer organization, title, package, rights grant, mandate, territory, language, exploitation model, asset kinds and explicit start/end.
- `writeFulfillmentAudit`: immutable audit event, same transaction.
- If a webhook event ID is supplied, complete that event in the same transaction as payment + entitlement + audit.

Required database constraints (names are intentionally not invented before schema reconciliation):

- Unique provider order ID for a Bridge payment record.
- Unique provider payment ID for a Bridge entitlement/fulfillment record.
- Unique webhook provider event ID.
- Foreign keys from payment → legal organization/title/package/rights grant/mandate.
- Foreign keys from entitlement → payment/legal organization/title/package/rights grant/mandate.
- Conditional state transitions and row locks so concurrent captures cannot create two entitlements.
- Exact-scope indexes for organization + title + rights grant + active window + revocation.
- Immutable audit identity and event references.

A retry with the same provider payment may return the already-created entitlement only when payment record, Buyer organization and title bindings match. A duplicate with conflicting bindings is a hard failure. A different payment ID for the same order is a hard failure.

## Provider capture verification

The `CaptureVerifier` is a server-only adapter. It must fetch the payment from Razorpay using server credentials and verify payment ID, order ID, captured status, amount and currency. Browser callback fields and webhook payload fields are not proof of capture. The webhook signature authenticates the event body but does not replace server-to-server payment reconciliation.

Do not expose Razorpay secrets or call the provider from browser code. Keep Preview/Test credentials isolated from Production. No real payment is needed for unit tests.

## One canonical webhook ingress

There are currently two source ingress candidates:

- TanStack `ingestRazorpayWebhook`
- Supabase Edge Function `razorpay-webhook`

Both currently fail closed for Bridge fulfillment. They must not both become independent fulfillment writers.

**Target architecture:** retain one externally configured Razorpay webhook endpoint as the canonical ingress. It verifies the webhook signature, persists/deduplicates the provider event and delegates Bridge capture fulfillment to the same server-only canonical fulfillment service. The other candidate must be disabled for Bridge events or reduced to a non-fulfilling compatibility adapter. The exact endpoint selection must be confirmed against current Razorpay webhook configuration and deployed routing before any runtime switch; configuration was not inspected or changed in this source-only task.

Do not make the Edge function directly update Bridge payments or entitlements. Do not let the TanStack verification handler and webhook each implement their own entitlement writer. Both trusted entry paths, if retained, must call the same service and same repository transaction.

## Entitlement and delivery boundary

An entitlement is not a general title-level permission. It must carry the exact Buyer organization, user, title, package, rights grant, mandate, territory, language, exploitation model, asset kinds, start/end and revocation binding.

At delivery time, authorization must re-read or reliably validate current membership, organization, mandate, rights grant, expiry and revocation. Do not trust a previously minted user/title entitlement alone. A catalog/screener grant never authorizes a master. A poster's public/catalog visibility does not imply rights to other asset kinds.

Signed object URLs are bearer capabilities and usually remain usable until expiry. Immediate revocation requires a revocable delivery proxy/token gateway or another revocation-aware delivery layer; short URL expiry only bounds, but does not eliminate, residual exposure. Do not claim instant revocation from a database flag alone.

## Regression coverage added

`canonical-fulfillment.test.ts` covers:

- exact active organization and mandate chain positive path;
- Buyer A/B and transaction organization mismatch;
- identity mismatch, inactive membership and organization;
- mandate overreach, cycles, missing chain and expiry;
- title/package, territory, language, exploitation-model and asset-kind mismatch;
- revoked, malformed, expired and over-broad rights windows;
- server capture mismatch (payment/order/status/amount/currency);
- payment owner mismatch;
- missing authorization fails before local writes;
- atomic service call shape and duplicate fulfillment binding.

These are source tests. They are **not executed or certified** by creating this branch. Exact-head CI, test output, independent review and concurrency tests against the eventual real adapter remain required.

## Explicit blockers / non-actions

- Canonical organization, membership, mandate, order, payment and entitlement persistence is not yet reconciled to a reviewed schema.
- CRA-128 Preview + private OCI isolation and CRA-138 migration/schema review remain prerequisites.
- The repository adapter, webhook event transaction adapter, and delivery/revocation gateway are not wired.
- No STAGING DB query/write/migration/RLS/ACL/Auth change, seed or runtime test.
- No PRODUCTION DB access or mutation.
- No Razorpay order/payment/webhook replay, invite, email, environment change, deployment, merge or promotion.
- Buyer checkout and Buyer downloads remain disabled.

**Certification:** SOURCE CONTRACT ADDED / NOT EXECUTED / NOT RUNTIME VERIFIED / NOT CERTIFIED.  
**Production:** HOLD / NOT CERTIFIED / NO-GO. App-inu pani kittaruthu.
