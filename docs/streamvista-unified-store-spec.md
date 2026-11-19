# StreamVista Unified Store — Architecture & Safe Implementation Plan

**Status:** Draft specification — not implemented, not certified, Production HOLD  
**Owner direction:** Unified StreamVista Store; Bridge governs B2B, Loop serves consumer commerce.  
**Rule:** Bridge authorizes → Loop delivers. App-inu pani kittaruthu.

## 1. Purpose

Create one coherent StreamVista commerce experience without creating a second rights authority, a second Bridge back office, a duplicate Supabase project, or an independent Loop operator CMS.

The Store is a commerce layer with distinct product lanes and ledgers. It is not one universal product/entitlement table.

## 2. System boundaries

### Crayons Bridge — control plane

Bridge remains the canonical control plane for:

- B2B buyer discovery, licensing offers, deal/contract approvals and buyer-specific delivery.
- Rights, ownership, QC, legal clearance, territories, languages, windows, exclusivity and sublicensing permissions.
- Internal service catalogue and evidence-based service quotes: prepare, master, QC, rights/legal, localize, package, deliver and archive.
- Store product governance, seller/vendor approval, SKU/product metadata, price/tax policy approval, order review, fulfilment oversight, finance and audit.
- Super Admin controls and staff RBAC.

A Store order or service payment must not automatically create a licence or rights grant. Licensing remains a separate approval and payment purpose.

### Crayons Loop — consumer runtime

Loop owns only consumer-facing functions:

- Public catalogue, product presentation, merchandising rails and approved consumer offers.
- Customer cart/checkout UX, customer account/order history, consumer payment experience and consumer entitlements.
- Playback and rental/subscription access after server-verified authorization.
- Consumer-safe order status and fulfilment tracking.

Loop may show Bridge-derived publication, offer, price and rights state as read-only projections. It must not edit authoritative rights, approve licenses, ingest masters or become a second staff/admin control plane.

## 3. Separate commerce lanes

Keep product and transaction types explicit. Never infer one lane's entitlement from another lane's payment.

| Lane | Buyer experience | Authority | Fulfilment result |
|---|---|---|---|
| B2B title licensing | Buyer offer, scoped deal, agreement, invoice/payment | Bridge | Title/version/territory/window-specific licence and authorized delivery |
| Bridge production/services | Evidence-based quote for required work | Bridge | Service work order completion; no licence entitlement |
| Loop TVOD rental | Consumer title page and one-time rental checkout | Bridge-approved offer + Loop checkout | Account/profile/title-scoped rental entitlement with expiry |
| Loop subscription/profile | Consumer subscription and additional-profile purchase | Approved Loop plan + provider mandate/consent | Subscription/profile entitlement only |
| Store merchandise / physical goods | Consumer product catalogue, cart and checkout | Bridge product governance + Loop storefront | Paid order, inventory reservation and verified shipment/delivery |
| Digital extras / downloads | Consumer product page and checkout | Bridge rights/asset approval + Loop delivery | Scoped digital fulfilment; never expose master/original assets |

Physical merchandise and digital extras are **future lanes** until SKU ownership, real inventory, tax classification, fulfilment provider, returns/refunds, customer support and rights/IP are verified. Do not invent products, stock, shipping rates or prices.

## 4. Canonical order contract

Use a commerce order concept with immutable line-item snapshots, but preserve separate payment purposes and fulfilment handlers for each lane.

Every order/quote snapshot must capture:

- Canonical order ID, customer/buyer identity and source channel.
- Product type, SKU/title/service reference and immutable version.
- Quantity, currency, base amount, approved discount, tax category/rate/source, tax amount and total payable.
- Offer/price version, effective period, terms and territory/language/window where applicable.
- Payment purpose, provider order/payment references, signature/webhook verification state and idempotency key.
- Fulfilment state, timestamps, actor, evidence, refund/chargeback/reversal state and audit history.

Never accept client-supplied amount, tax, rights, entitlement, inventory availability or fulfilment completion as authoritative. Resolve them server-side from approved records.

Suggested order lifecycle:
`DRAFT → QUOTED → ACCEPTED → PAYMENT_PENDING → PAID → FULFILMENT_PENDING → FULFILLED`
with explicit `FAILED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED`, `DISPUTED` and `REQUIRES_REVIEW` states. Do not force all product lanes through identical state transitions.

## 5. Non-negotiable separation rules

1. A B2B licence payment may create only the matching scoped licence/entitlement after agreement, rights and captured-payment checks.
2. A Bridge service payment may create/update only its service order; it must never mark a title LICENSED.
3. A Loop TVOD payment creates only the approved title/account/profile rental entitlement, with exact expiry, territory and rights-window checks.
4. A subscription payment creates only the matching subscription/profile entitlement. TVOD remains separately charged.
5. A merchandise payment creates an order and inventory/fulfilment reservation, never a media playback entitlement.
6. A digital-extra purchase may deliver only the specifically approved asset/version and usage rights.
7. A successful browser redirect is not payment evidence. Verify signed provider webhook/payment fetch, amount, currency, order notes and idempotency before fulfilment.
8. Refunds, chargebacks, cancellations and rights revocations must reconcile the corresponding order and access state without deleting history.
9. Store merchandising cannot publish unpublished, revoked, embargoed or rights-blocked media.
10. Buyer, Creator, Studio and consumer account RBAC remain separate from payment entitlements.

## 6. Existing work to reuse — do not duplicate

- Loop issue #48 locks Bridge authority and Loop consumer catalogue/merchandising/commerce/playback boundaries.
- Loop issue #193 is the owner-approved P0 specification for guest browsing, ₹26 / 2-month subscription, separately charged TVOD, Bridge-originated TVOD offers, tax snapshots and test-only verification. Follow it; do not revive retired ₹79/₹149/₹999 plans or invent GST rates.
- Loop PR #113 is an existing draft Preview-only hybrid-commerce foundation. Audit and reconcile it with issue #193 before any additional Loop checkout implementation; do not create a competing checkout path.
- Bridge issue #133 identifies the missing service-charge catalogue, quote/order model and separation of service revenue from licence revenue. Reuse its direction; do not add a parallel service payment system.
- Bridge's existing buyer/licensing/payment work remains the B2B path. Do not duplicate it as a generic Store checkout.

This specification does not approve merging or replacing any of those open PRs.

## 7. Security, data and environment gates

- Server-side authorization on every read/write; least-privilege access and audit all sensitive actions.
- No service-role, payment secret, storage credential or privileged token in browser code.
- No new Supabase project and no second canonical title/product authority.
- No database migration in this specification phase.
- No invented prices, GST rates, stock, shipping, payment success, customer or fulfilment evidence.
- No customer emails/SMS, live charges, refunds, mandate changes, domain changes or production promotion without separate approval.

### Database environment matrix

| Database | Action | Access | Risk | Gate |
|---|---|---|---|---|
| STAGING DB — `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB) | Schema/migration inventory and compatibility review only | READ-ONLY | Medium | Reconcile all applied migrations, RLS, policies, grants and required table contracts before any additive WRITE |
| PRODUCTION DB — `mlmgugivsyoxzdgwkbpu` | No Store work | READ-ONLY | High | HOLD / NOT CERTIFIED / NO-GO; no writes |

Any future STAGING WRITE requires a separately reviewed additive migration and explicit scoped approval. Production changes require a separate explicit approval and full release gates.

## 8. Phased delivery

### Phase 0 — this PR
Architecture specification only. No runtime code, schema, payment, email, Vercel or production changes.

### Phase 1 — read-only integration audit
Map existing Bridge service/licensing orders and Loop TVOD/subscription order flows. Identify exact canonical IDs, payment-purpose enums, webhook ownership, order history and current PR overlap. Deliver a gap matrix; do not write to either database.

### Phase 2 — isolated Preview foundations
Implement only the missing lane-specific UI/API contracts on isolated branches/PRs. Reuse existing checkout and payment safeguards. No live charges. No database writes until STAGING schema compatibility is proven and separately approved.

### Phase 3 — test-mode end-to-end
Use synthetic accounts and provider test mode only. Verify negative cases, signature/idempotency, tax snapshots from approved configuration, refunds/reversals and exact fulfilment outcomes. No production data or real customer transactions.

### Phase 4 — separate release decision
Require exact-head CI, typecheck, lint, tests, build, secret scan, Preview runtime and mobile/browser verification. Production remains HOLD until a separate release approval.

## 9. Acceptance criteria

- One clear Store entry point, with distinct B2B and consumer lanes.
- Bridge remains the only rights/licensing and staff-operations authority.
- Loop remains the consumer storefront/runtime and uses Bridge-authorized projections.
- No cross-lane payment-to-entitlement leakage.
- No duplicate checkout or payment handler where an existing approved flow can be reused.
- All displayed money is server-calculated and traceable to an approved price/tax snapshot.
- Existing order, payment, entitlement and audit history is preserved.
- All failure, retry, refund, chargeback, expiry and revocation paths fail closed and are auditable.
- No unrelated app regression; exact-head verification required before any merge/promotion.

**Current decision:** specification draft only. No implementation certification. Production HOLD / NO-GO.
