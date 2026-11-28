# Crayons Bridge Storage Business & Billing — Audit and Implementation Gates

**Date:** 2026-11-28  
**Scope:** Read-only audit of the Bridge repository, Testing Supabase project, Vercel Bridge environment metadata, and connected Razorpay account records.  
**Release posture:** Draft only. No Production writes, no live payment-link creation, no customer-facing price publication.

## Executive summary

The repository already contains an OCI Object Storage adapter and DIT Primary/Recovery object evidence. The Testing database does not yet contain a storage-business billing ledger, and its relevant asset/DIT/payment tables currently contain no rows. Razorpay has legacy storage-related orders, but the latest 100 orders returned contain 17 storage/vault-related orders and all 17 are still `created`; no matching captured storage payments were present in the latest 100 payments returned.

The current Bridge webhook code is not a complete storage-top-up processor. Its Bridge route expects a matching local `bridge_payments` order, while the Supabase Edge Function's surface detector does not recognize the existing `meta_payment_purpose=storage_topup` notes pattern. The Edge Function's captured-payment handler has no storage entitlement branch. This must be corrected and tested in Razorpay Test Mode before storage billing is enabled.

Actual OCI purchase cost cannot yet be certified: the connected tools do not provide OCI Cost Analysis / Usage Reports or bucket inventory access, and the Bridge Preview environment metadata does not show a dedicated Testing OCI + Recovery configuration or Razorpay Test Mode credentials.

## 1. OCI integration audit

### Existing implementation

- `src/lib/bridge/oci-object-storage.server.ts` implements native OCI Object Storage REST requests with OCI request signing.
- The adapter supports signed upload/download requests, object HEAD verification, streamed SHA-256 verification, object copy/sealing, and deletion.
- `src/lib/bridge/env.ts` reads:
  - `OCI_TENANCY_OCID`
  - `OCI_USER_OCID`
  - `OCI_FINGERPRINT`
  - `OCI_PRIVATE_KEY` (or legacy `PRIVATE_KEY`)
  - `OCI_REGION`
  - `OCI_NAMESPACE`
  - `OCI_BUCKET_NAME`
  - `OCI_RECOVERY_BUCKET_NAME`
- The DIT agent selects the Recovery bucket separately; the recovery bucket must not be treated as the Primary bucket.

### Existing object evidence

- `public.bridge_assets` stores object-level information including provider, bucket, namespace, region, endpoint, object keys, byte size, storage tier, retention and hold metadata.
- `public.bridge_dit_storage_objects` records each DIT file copy with `copy_type` (`PRIMARY` / `RECOVERY`), bucket, object key, SHA-256, byte size, ETag and verification status.
- `public.bridge_dit_ingest_sessions` carries organization ownership and source totals, allowing DIT records to be related to an organization when real sessions exist.
- `public.streamvista_project_assets` stores user-owned project asset metadata and byte size.

### Missing for commercial metering

- No OCI Usage API / Cost Analysis collector was found in the repository search.
- No storage usage snapshot/event ledger or customer billing tables were found in Testing.
- Existing object metadata is not itself a complete cost ledger: it does not establish time-weighted GB-month usage, billable egress, API request charges, OCI invoice cost, or a reliable tenant attribution rule for every shared-bucket object.
- No OCI cost report or actual Testing bucket inventory could be retrieved in this audit.

### Testing data observation

The following Testing tables each returned zero rows and zero recorded bytes at audit time:

| Table | Rows | Recorded bytes |
|---|---:|---:|
| `bridge_assets` | 0 | 0 |
| `bridge_dit_ingest_sessions` | 0 | 0 |
| `bridge_dit_storage_objects` | 0 | 0 |
| `streamvista_project_assets` | 0 | 0 |
| `bridge_payments` | 0 | 0 |
| `bridge_webhook_events` | 0 | 0 |

The Testing project contains no `storage_accounts`, `storage_usage_daily`, `storage_usage_events`, `storage_rate_cards`, `storage_invoices`, or equivalent commercial billing tables.

### Environment limitation

The Vercel Bridge project environment metadata shows the OCI credential set is configured for Production and/or Development targets, not as a dedicated isolated Testing Preview configuration. A Preview `OCI_FINGERPRINT` entry exists but is not evidence of a complete credential set. No `OCI_RECOVERY_BUCKET_NAME` entry was found in the inspected environment metadata.

**Gate:** Do not reuse Production OCI credentials or bucket for Preview metering tests. Provision a dedicated Testing tenancy/bucket pair or explicitly approved isolated Testing buckets, including a separate Recovery bucket, before attempting OCI E2E.

## 2. Supabase Testing audit

The Testing project is `jbymleftneggcgutlcqu`.

Relevant existing RLS observations:

| Table | RLS | Force RLS | Policy count |
|---|---:|---:|---:|
| `bridge_assets` | enabled | no | 2 |
| `bridge_dit_ingest_files` | enabled | no | 1 |
| `bridge_dit_ingest_sessions` | enabled | no | 1 |
| `bridge_dit_storage_objects` | enabled | yes | 1 |
| `bridge_payments` | enabled | no | 1 |
| `bridge_webhook_events` | enabled | no | 1 |
| `streamvista_project_assets` | enabled | no | 1 |
| `streamvista_service_orders` | enabled | no | 1 |

Policy counts are inventory only, not a certification that each policy is correct. Tenant-isolation tests are still required.

### Recommended data boundary

Use the existing non-exposed `bridge_private` schema for internal storage business data. Keep purchase costs, OCI vendor invoices, margins and profit calculations out of customer-readable tables and APIs. Do not add the financial cost ledger to an exposed schema.

Proposed logical records:

- Storage account / tenant-to-storage mapping
- OCI cost import and source evidence
- Daily usage snapshots by tenant, bucket, storage class and copy type
- Immutable usage events and reconciliation adjustments
- Versioned purchase-cost inputs and customer selling-rate cards
- Invoice headers and invoice line items
- Razorpay order/payment reconciliation
- Webhook event idempotency
- Storage billing audit events

Do not create these tables until the migration is generated and reviewed through the repository's normal Supabase migration workflow. No Testing or Production DDL was executed during this audit.

## 3. Razorpay audit

### Existing order activity

Among the latest 100 orders returned by the connected Razorpay account, 17 matched storage/vault-related references:

| Existing note / tier | Count | Provider order status |
|---|---:|---|
| `storage_topup / master_1tb` | 6 | All `created` |
| `storage_topup / gb100` | 4 | All `created` |
| `storage_topup / tb1` | 1 | `created` |
| `studio_vault` | 5 | All `created` |
| Other top-up receipt without tier metadata | 1 | `created` |

Combined amount represented by those 17 created orders: **₹13,751.60**. This is not collected revenue, not a verified invoice balance, and not a valid cost or selling-price benchmark.

No matching storage/vault/top-up payments were found in the latest 100 payments returned. No storage-specific Payment Link was found in the Payment Links listing. The existing tier amounts are historical order amounts only and must not be republished without a cost and tax review.

### Webhook code-path finding

- `src/routes/api/razorpay/webhook.ts` delegates to `ingestRazorpayWebhook` in `src/lib/bridge/payments.ts`.
- The Bridge handler verifies the webhook signature and records an idempotent event, but captured payments are routed through `grantFromCapturedPayment`, which looks up `bridge_payments`. It does not implement a storage-top-up entitlement flow.
- `supabase/functions/razorpay-webhook/index.ts` detects a surface from `surface`, `product`, `app`, `source`, `planKey` or `accessType` notes. The observed storage order metadata uses `meta_payment_purpose=storage_topup`, `meta_tier`, `topup_id`, and user identifiers; that pattern is not recognized by the current detector.
- The inspected Edge Function's `payment.captured` path contains Bridge payment handling, but no storage-top-up invoice or entitlement handling. An event that is not classified as Bridge can fall through to the final processed-event update without a storage entitlement being recorded.

This is a source-code gap, not a claim that a live webhook was invoked during this audit.

### Testing environment limitation

The inspected Vercel Bridge environment metadata showed `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` on the Production target. No branch-scoped Preview/Test Mode set was found. Secret values were not decrypted or displayed.

**Gate:** Create dedicated Razorpay Test Mode credentials and a Test Mode webhook endpoint/secret for the storage billing Preview. Do not copy Production credentials into Preview. Test captured, failed, duplicate, partial/refund and unknown-surface events before enabling any customer billing.

## 4. Pricing and financial controls

No customer-facing price should be published from the historical Razorpay order amounts.

The Super Admin-only pricing engine should calculate:

`Total unit cost = OCI purchase cost + operating overhead + payment collection cost + risk allowance`

`Selling price = Total unit cost / (1 - target gross margin)`

The rate card must keep Primary and Recovery storage separate, and separately meter egress and any materially billable requests. Store rate-card versions and snapshot the applicable rate and calculation inputs onto each invoice line so later price changes do not rewrite historical invoices.

GST and other taxes must be calculated separately from revenue and profit, with the final treatment reviewed by the company's accountant.

### Role separation

- Super Admin: OCI purchase costs, operating overhead, rate cards, margins, profitability, invoices, payment reconciliation and exceptions.
- Creator / Studio: own usage, customer selling rate, invoice and payment status only.
- DIT: permitted ingest, verification and storage usage information; no vendor purchase cost or profit.
- External customer: own usage, selling rate, invoices and payments.
- Buyer / Investor: no OCI vendor cost or internal margin access.

## 5. Implementation sequence

### P0 — unblock Testing evidence

1. Provision isolated Testing OCI Primary and Recovery buckets and Preview-only credentials.
2. Provision Razorpay Test Mode credentials and webhook secret for the storage Preview branch.
3. Confirm OCI Usage/Cost Analysis access and obtain a sample billing/usage export with account-sensitive details kept out of Git.
4. Define the canonical tenant attribution rules for Bridge titles, DIT organizations and StreamVista project assets.

### P1 — implement secure billing foundation

1. Generate and review migrations for internal storage billing tables in `bridge_private`.
2. Implement immutable cost imports, daily usage snapshots, event deduplication and reconciliation.
3. Implement versioned purchase-cost and selling-rate cards, with Super Admin-only financial access.
4. Implement invoice generation with reproducible line-item calculations.

### P2 — integrate Razorpay Test Mode

1. Add a distinct storage billing surface and explicit storage order metadata.
2. Verify webhook signatures against the raw request body.
3. Match every captured payment to a persisted local invoice/order, amount and currency.
4. Process each provider event idempotently; never acknowledge an unsupported event as successfully fulfilled.
5. Grant/extend storage entitlements only after verified capture and reconciliation.

### P3 — customer and Super Admin UI

1. Super Admin Storage Business & Billing: purchase cost, selling price, gross profit, margin, customer profitability and exceptions.
2. Customer Storage Dashboard: own usage, selling rate, invoice and payment status only.
3. Add role-isolation tests across Creator, Studio, DIT, External, Buyer, Investor, Super Admin and Internal Operations.

### P4 — production gate

Production rollout requires exact-head CI, migration replay in Testing, OCI metering evidence, tenant-isolation proof, Razorpay Test Mode webhook E2E, invoice calculation tests, accountant review and explicit release approval.

## 6. Non-goals and safety boundaries

- No Production database writes or migrations.
- No Production OCI object, bucket, credential or lifecycle changes.
- No Production Razorpay payment links, orders, webhook configuration or customer price publication.
- No use of historical order amounts as cost evidence.
- No synthetic usage, fake cost, fake invoice, or fake payment status.
- No automatic deletion of customer files for overdue invoices.
- No effect on Bridge QC, Rights, Legal, licensing, delivery or publication approvals.

## Audit references

- `src/lib/bridge/oci-object-storage.server.ts`
- `src/lib/bridge/env.ts`
- `src/lib/bridge/payments.ts`
- `src/routes/api/razorpay/webhook.ts`
- `supabase/functions/razorpay-webhook/index.ts`
- `supabase/migrations/20261114135434_bridge_dit_storage_objects_20261114.sql`
