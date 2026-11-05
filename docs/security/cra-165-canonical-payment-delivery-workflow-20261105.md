# CRA-165 — canonical Buyer payment-to-delivery workflow

**Status:** Source-only implementation in progress; NOT certified  
**Branch:** `feat/cra-165-canonical-payment-delivery-implementation-20261105`  
**Parent:** PR #474 remains Draft and unchanged  
**Production:** HOLD / NOT CERTIFIED / NO-GO  
**Database:** No query, write, migration, or seed performed by this implementation.

## 1. Implemented in this increment

### Explicit identity resolution

- Removed verified-email matching against `auth.users` as an identity recovery path.
- Removed the fallback that returned the raw auth subject when no Bridge profile/link existed.
- Direct profile identity and explicit `bridge_loop_identity_links` are the only accepted mappings.
- Duplicate mappings, mismatched direct identities, conflicting direct/link mappings, and unresolved identities are explicit errors.
- Organization lookup requests up to two active memberships and rejects ambiguous results rather than choosing an arbitrary first row.
- Added pure behavior tests for accepted direct/link mappings and unresolved, duplicate, mismatched, and conflicting identities.

### Buyer delivery fail-closed guard

- Added `assertBuyerDeliveryBlocked` and invoked it before asset download authorization or signed URL generation.
- External Buyer accounts are blocked even when a legacy `bridge_entitlements(user_id,title_id,access_type)` row exists.
- Internal staff accounts are not classified as external Buyers solely because their account type is Buyer.
- Added tests for Buyer denial, null organization, internal reviewer, and non-Buyer owner behavior.

This is intentionally a deny gate, not a new entitlement implementation. It prevents legacy user/title entitlement rows from being mistaken for a legal-organization/mandate delivery license.

## 2. Canonical payment-to-delivery transaction contract

The completed workflow must have one server-owned state transition:

`ORDER_CREATED → PAYMENT_CAPTURED → ENTITLEMENT_ACTIVE → DELIVERY_AUTHORIZED`

No browser callback, webhook payload, payment note, email, display name, or client-supplied organization ID can directly create an entitlement.

### A. Order creation

Inside a database transaction, resolve and lock:

- authenticated Bridge actor and exact identity mapping;
- active Buyer legal organization membership;
- active Buyer organization;
- exact offer/package and source rights grant;
- complete mandate chain, including explicit onward-delegation authority;
- territory, language, exploitation model, asset kinds, exclusivity, price, currency, and license window.

Persist an immutable order snapshot with `buyer_organization_id`, `acting_user_id`, package, grant, mandate, scope digest, amount/currency, and idempotency key. The Razorpay order is created only after local validation. A provider-order creation followed by local persistence failure must be reconciled, not silently re-created.

### B. One payment verification / webhook fulfillment service

Both the signed checkout verification endpoint and the single configured Razorpay webhook ingress must call the same internal function. That function must:

1. Validate the signed provider event / checkout signature.
2. Fetch the payment from Razorpay server-to-server; require `captured`, matching order, amount, and currency.
3. Lock the local payment/order row and re-check organization, mandate, grant, offer, terms, and revocation.
4. Verify provider payment ID is not already bound to a different order.
5. In one database transaction, mark payment captured and insert the organization-scoped entitlement using a unique idempotency constraint.
6. Write audit/outbox records in the same transaction.
7. Return the already-created entitlement on exact duplicate delivery; reject conflicting replay.
8. Never mark a webhook event processed before the canonical fulfillment transaction commits.

The Razorpay event payload is a notification, not proof of amount, currency, or entitlement scope.

### C. Webhook ingress consolidation

Current source contains both:

- TanStack route `/api/razorpay/webhook` → `ingestRazorpayWebhook` in `src/lib/bridge/payments.ts`;
- Supabase Edge Function `supabase/functions/razorpay-webhook/index.ts`.

Both currently use `bridge_webhook_events` and both retain a CRA-165 Bridge fulfillment stop. Do not configure both as independent Razorpay destinations. Select one ingress only after deployment topology and Loop ownership are reviewed. Any retained secondary endpoint must be explicitly non-fulfilling and must not race to claim the same event lease. Loop payments must remain separated by an explicit product/surface routing contract and must not enter Bridge license fulfillment.

### D. Entitlement and delivery

The entitlement must bind the exact Buyer organization, acting member, payment, order, package, rights grant, mandate chain, and immutable scope snapshot. It must include effective start/end, status, revocation timestamp/reason, territory, language, exploitation model, and permitted asset kinds.

For every download request, the server must re-check:
- actor is still an active member of the same Buyer organization;
- organization and every mandate edge remain active and unexpired;
- entitlement is captured, active, within term, and not revoked;
- requested title/package/asset kind and asset version are within the exact entitlement;
- rights grant remains valid and has no conflicting exclusive grant.

Only then may storage return a short-lived signed URL. Existing object-storage signed URLs cannot generally be revoked after issuance; expiry limits the residual exposure window. Immediate revocation requires a proxy/authorization gateway or equivalent revocable delivery token, not merely marking a database row revoked.

## 3. Known blockers — no silent assumptions

| Gate | Current evidence | Status |
|---|---|---|
| Buyer identity mapping | Explicit mapping resolver + behavior tests added in this branch; exact-head CI not run | PARTIAL |
| Buyer organization membership | Source lookup exists; schema/runtime/ambiguous membership behavior not exercised against isolated DB | NOT VERIFIED |
| Mandate chain persistence | No canonical persisted schema wired to orders/payments/entitlements | BLOCKED |
| Payment organization binding | `bridge_payments` source schema is user/title/package scoped | BLOCKED |
| Package entitlement binding | `bridge_package_entitlements` is buyer-user scoped | BLOCKED |
| Title entitlement binding | `bridge_entitlements` is user/title/payment scoped | BLOCKED |
| Razorpay server verification | Checkout signature path exists; captured payment verification is not part of the blocked grant function | BLOCKED |
| Canonical webhook writer | Two ingress implementations exist; both retain Bridge fulfillment stop | BLOCKED |
| Buyer signed delivery | External Buyer signed downloads now fail closed | PARTIAL |
| Revocation | Existing object signed URL cannot be instantly revoked; no org/mandate entitlement check yet | BLOCKED |
| Buyer A/B, Distributor A/B, rights overlap | No isolated runtime suite executed | NOT VERIFIED |
| CRA-128 Preview + private OCI | Still In Progress / not certified | BLOCKED |

## 4. Required next source increments

1. Reconcile all order/payment/webhook ingress paths, including Loop surface ownership; choose one Bridge ingress.
2. Design the additive canonical schema for legal Buyer organization, mandate chain, immutable offer/order snapshot, payment, entitlement, delivery authorization, and revocation.
3. Implement a single transactional fulfillment service called by both checkout verification and the selected webhook ingress.
4. Replace legacy user-only Buyer entitlement checks with organization + mandate + rights-scope checks; keep Buyer downloads blocked until this is complete.
5. Add deterministic unit/contract tests for capture amount/currency mismatch, duplicate/replayed webhook, conflicting payment ID, concurrent capture, Buyer A/B, Distributor A/B, ambiguous/suspended membership, mandate expiry/revocation, rights overlap, asset-kind/territory/language mismatch, and post-revocation delivery.
6. Obtain exact-head CI and independent security/legal review.

## 5. Environment and release controls

- No STAGING DB or PRODUCTION DB access was used for this source increment.
- No migration file is included or applied.
- CRA-128 must be certified before STAGING runtime/E2E tests are considered.
- No real Razorpay payment or webhook was sent.
- No mail was sent, no deployment was created, and no branch was merged.
- PR #474 remains Draft. This branch is also review-only until exact-head checks and independent review are complete.

**Production: HOLD / NOT CERTIFIED / NO-GO.**  
**Zero-regression: App-inu pani kittaruthu.**
