# Crayons Bridge — Independent Audit Evidence Register

**Audit date:** 2026-11-03  
**Repository:** `picturecrayons-cyber/Media-Factory`  
**Audit branch:** `audit/staging-rls-acl-remediation-proposal-20261103`  
**STAGING DB:** `jbymleftneggcgutlcqu` — read-only  
**PRODUCTION DB:** `mlmgugivsyoxzdgwkbpu` — excluded / protected  
**Decision:** Audit remains INCOMPLETE. This register distinguishes verified evidence from unknowns; it is not a certification.

## 1. Independent decision

| Control | Result | Evidence / limitation |
|---|---|---|
| 32-table STAGING inventory | PASS | 32 public tables enumerated in the read-only catalog snapshot |
| RLS enabled | PASS | 32/32 enabled |
| FORCE RLS | FAIL | 0/32 enabled |
| RLS policies | FAIL | 0 policies recorded for the 32-table set |
| Direct anon/auth table grants | FAIL | 17/32 tables for each role; includes TRUNCATE |
| Column / sequence / schema ACL | PARTIAL | Counts captured; full per-column and per-sequence mapping to app callsites incomplete |
| Default ACL / ownership | PARTIAL | Broad defaults and postgres ownership observed; all migration owners and object provenance not reconciled |
| Browser Data API inventory | NOT VERIFIED | Complete browser callsite proof not yet available |
| 32-table route/action map | NOT VERIFIED | Matrix below deliberately marks unproven callsites unknown |
| DIT quote confidentiality | P0 FAIL | Source confirms internal cost/margin returned by createServiceQuote to Creator/Studio |
| Other DIT response paths | PARTIAL | Several return shapes inspected; complete call-chain and invoice/refund/settlement reader coverage not proven |
| Canonical identity | BLOCKED | direct profile → identity-link → verified-email fallback; authority and missing dependencies unresolved |
| Migration SHA-256 parity | NOT VERIFIED | Full byte-exact inventory/checksums across both directories not produced |
| Vercel Preview isolation | NOT VERIFIED | CRA-128 runtime target/role proof remains a prerequisite |
| Remediation / rollback | NOT READY | No object-specific executable diff or inverse rollback approved |
| Certification | NOT GRANTED | P0 open and multiple material gates unresolved |

## 2. Complete 32-table catalog with evidence status

The names below are the 32 public STAGING relations in the read-only snapshot. RLS=ON and FORCE=OFF apply to every row. Direct grants refer only to the direct table-level catalog query; absence does not prove inaccessibility through column grants, inherited roles, functions, service role or server paths.

| # | STAGING table | Direct anon/auth table grants | Source route / function mapping | Permission / scope / RLS expectation |
|---:|---|---|---|---|
| 1 | `bridge_asset_versions` | YES — 7 each | `listAdminWorkstations` broad internal read; other asset version callsites not fully enumerated | Internal asset/version access; exact role scope NOT VERIFIED |
| 2 | `bridge_assets` | YES — 7 each | `listAdminWorkstations`; title asset workflows | Internal/owner-scoped assets; signed download authorization NOT VERIFIED |
| 3 | `bridge_audit_logs` | YES — 7 each | `listAdminWorkstations`; review/admin audit writes | Internal-only, least-privilege per internal role; NOT VERIFIED |
| 4 | `bridge_buyer_interest` | YES — 7 each | Buyer-interest callsites NOT VERIFIED | Buyer own-record / internal review scope NOT VERIFIED |
| 5 | `bridge_destination_packages` | YES — 7 each | `listAdminWorkstations`; licensing/publication workflows | Internal licensing control; buyer permitted package view only; NOT VERIFIED |
| 6 | `bridge_email_challenges` | YES — 7 each | Auth/onboarding callsites NOT VERIFIED | Server-only challenge secrets; NOT VERIFIED |
| 7 | `bridge_entitlements` | YES — 7 each | Buyer entitlement read/payment flows | Buyer own entitlement only; server-authoritative write expected; PARTIAL |
| 8 | `bridge_invites` | YES — 7 each | Invite/onboarding callsites NOT VERIFIED | Server-only token handling; org/recipient scoped; NOT VERIFIED |
| 9 | `bridge_legal_cases` | YES — 7 each | `listAdminWorkstations`; legal review actions | Legal/internal roles only; NOT VERIFIED |
| 10 | `bridge_payments` | YES — 7 each | Buyer payment actions; Razorpay webhook | Server-only financial writes; buyer own payment status only; PARTIAL |
| 11 | `bridge_profiles` | YES — 7 each | Session/identity resolution; `listAdminWorkstations` | Self profile plus minimal authorized internal view; NOT VERIFIED |
| 12 | `bridge_qc_cases` | YES — 7 each | `listAdminWorkstations`; `reviewAdminTitle` | QC reviewer/internal scope; NOT VERIFIED |
| 13 | `bridge_rights_grants` | YES — 7 each | `listAdminWorkstations`; rights review actions | Rights/legal internal scope; NOT VERIFIED |
| 14 | `bridge_story_concept_submissions` | YES — 7 each | Creator/Studio submission workflows | Submitter own records and authorized reviewer scope; PARTIAL |
| 15 | `bridge_title_events` | YES — 7 each | `getTitle`; `reviewAdminTitle`; audit writes | Event visibility by audience; notes/actor IDs classification PENDING |
| 16 | `bridge_titles` | YES — 7 each | `listTitles`, `getTitle`, `listAdminWorkstations` | Buyer published+visible; Creator/Studio own/org; Investor assignment; internal catalog permission; PARTIAL |
| 17 | `bridge_webhook_events` | YES — 7 each | Razorpay webhook path | Server-only, signature/idempotency/retention review pending |
| 18 | `bridge_financial_ledger` | No direct table grant returned | Service finance functions | Finance/Admin-only; internal ledger never customer-facing; PARTIAL |
| 19 | `bridge_service_catalog` | No direct table grant returned | `createServiceQuote` and quote pricing | Customer-visible service descriptions only; internal cost data must remain private; P0 related |
| 20 | `bridge_service_costs` | No direct table grant returned | `createServiceQuote`, financial summary, actual cost | Finance/Admin-only; internal cost confidentiality; P0 related |
| 21 | `bridge_service_invoices` | No direct table grant returned | Invoice creation/read callsites NOT VERIFIED | Customer invoice DTO allowlist; no cost/margin/ledger fields; NOT VERIFIED |
| 22 | `bridge_service_order_events` | No direct table grant returned | Order event callsites NOT VERIFIED | Customer-safe order status; internal operational notes restricted; NOT VERIFIED |
| 23 | `bridge_service_orders` | No direct table grant returned | `acceptServiceQuote`, payment workflow | Customer own order only; internal cost/margin hidden; PARTIAL |
| 24 | `bridge_service_quote_lines` | No direct table grant returned | `createServiceQuote` | Customer DTO allowlist; per-line costBasis/margin not returned externally; FAIL at create response |
| 25 | `bridge_service_quotes` | No direct table grant returned | `createServiceQuote`, `acceptServiceQuote` | Creator/Studio own-title quote; P0 cost/margin leak on create response |
| 26 | `bridge_service_rates` | No direct table grant returned | Quote pricing | Internal rate/cost basis not exposed; customer selling price only; PARTIAL |
| 27 | `bridge_service_settlement_lines` | No direct table grant returned | Settlement/finance functions | Finance-only settlement basis; customer responses must not expose line cost/margin; NOT VERIFIED |
| 28 | `bridge_service_settlement_rules` | No direct table grant returned | Settlement functions | Finance/Admin-only rules; NOT VERIFIED |
| 29 | `bridge_tax_rates` | No direct table grant returned | Quote/payment tax calculation | Server-managed tax configuration; customer sees applied tax only; PARTIAL |
| 30 | `bridge_title_duplicate_reviews` | No direct table grant returned | Duplicate title review callsites NOT VERIFIED | Internal QC/admin only; NOT VERIFIED |
| 31 | `bridge_title_reconciliation_events` | No direct table grant returned | Reconciliation callsites NOT VERIFIED | Internal-only audit trail; NOT VERIFIED |
| 32 | `bridge_title_reconciliation_snapshots` | No direct table grant returned | Reconciliation callsites NOT VERIFIED | Internal-only snapshot; NOT VERIFIED |

**Important:** The 32 rows provide a catalog-level register and explicitly record partial/unknown source mapping. They do not satisfy the full callsite proof required for certification. A route/table mapping must be proven from every query, mutation, server function, API handler, trigger and background job before any ACL change.

## 3. Route inventory status

Generated TanStack route tree contains 33 route entries. The following source boundaries have been partially inspected:

- `/admin`: internal RequireBridge gate; page narrows admin/super_admin.
- `/buyer`: buyer gate; uses `listTitles`, own entitlements and payment actions.
- `/creator`, `/studio`, `/investor`, `/workspace`: role-gated route entry; underlying server functions require independent authorization checks.
- `/dashboard`: `getDashboardSession` server session gate.
- `/account`: RequireBridge session/profile surface.
- `/api/razorpay/webhook`: signed webhook verification path; end-to-end signature, idempotency and transaction proof pending.
- `/api/auth/$`: hard-coded Production Supabase URL in GET/POST; runtime use NOT VERIFIED; Preview isolation concern.
- `/api/a2a/*`: public read-only registry/capability metadata in inspected source.

Remaining route modules and their server function callsites are not completely audited. Do not treat a route-level UI guard as server-side authorization evidence.

## 4. DIT confidentiality — confirmed P0

`createServiceQuote`:
- Requires authenticated, verified Bridge actor.
- Requires `service.quote_create`.
- RBAC grants that permission to `independent_creator` and `studio`.
- Computes and persists internal cost basis and estimated margin.
- Returns aggregate `estimatedCostPaise`, `estimatedMarginPaise` and per-line `costBasisPaise` / `estimatedMarginPaise` to the caller.

This is a source-level confidentiality defect. No live customer request was made and no actual customer data exfiltration is asserted.

Other inspected response paths:
- `acceptServiceQuote`: order/quote IDs and customer amount only in inspected return shape.
- `createServicePaymentOrderFn`: provider order ID, amount, currency, public key ID and payment record ID; no cost/margin observed.
- `verifyServicePayment` / capture: customer subtotal/tax/total and identifiers; internal cost read for ledger processing, not observed in returned shape.
- Refund/chargeback helpers: identifiers and refund/chargeback amounts in inspected return shapes; complete call chain and external caller verification pending.
- `getCommercialFinancialSummary`: `finance.read` required; includes internal cost/settlement/net-profit data.
- `recordServiceActualCost`: `finance.configure` required, but no current role grant was found in inspected RBAC map — separate finance workflow authorization gap.
- Delivery trace returns own-title settlement status only in inspected DTO; no settlement amount/cost/margin observed.

Invoice readers, quote readers, order status serializers, settlement response callers, webhook idempotency and all external serialization tests remain incomplete. P0 remains OPEN.

## 5. Identity and missing relations

- `resolveBridgeUserId` resolves direct `bridge_profiles.user_id`, then `bridge_loop_identity_links.auth_user_id`, then legacy verified-email matching to `auth.users`, else returns Auth user ID.
- Canonical cross-product identity authority is unresolved.
- `0007a_identity_links.sql` references `public."user"(id)`; relation absent from reviewed 32-table public inventory.
- `0009_buyer_title_access.sql` creates `bridge_buyer_title_access`; absent from reviewed inventory.
- `0012_bridge_rls_identity_binding.sql` references `bridge_loop_publications`; absent from reviewed inventory.
- `0021_bridge_organizations.sql` creates organization and membership relations absent from reviewed inventory.
- Existing Super Admin identity must be preserved. No second Super Admin, duplicate identity link or email/org-name inference is authorized.

## 6. Migration reconciliation

- Root `migrations/` and `supabase/migrations/` are separate migration paths.
- `src/lib/db.ts` application runner uses top-level root `migrations/*.sql`; nested auth migration files are excluded unless copied to root.
- Runner keys migration records by basename and sorts lexically.
- STAGING history has 13 entries through `testing_security_hardening_20261030`; this does not prove source-byte parity.
- Git blob SHA values are SHA-1 object identifiers, not SHA-256 file checksums.
- Complete directory enumeration, exact SHA-256 of every migration file, duplicate basename analysis, migration-owner verification, pre/postconditions and inverse rollback remain NOT VERIFIED.
- `0006_loop_canonical.sql` contains data-changing title/publication/catalogue operations and must not be replayed into Bridge STAGING.

## 7. Required evidence before audit closure

1. Full route tree and every route module inspected, including nested routes and API handlers.
2. Every `createServerFn`, server action, RPC, direct Supabase client call, SQL query, storage operation, trigger and scheduled/background path inventoried.
3. Exact table/column access mapped to function, route, role, permission, owner/org/buyer scope, read/write operation and RLS expectation.
4. Invoice, quote read, order status, refund, settlement and webhook full call-chain/DTO verification.
5. Title event note and audit metadata audience classification.
6. Canonical identity decision and existing Super Admin mapping; missing schema relation definitions reconciled without creating identities.
7. Full migration file inventory in both directories, exact SHA-256 checksums, duplicate basenames, STAGING migration ledger, app runner ledger, owners, dependency graph and inverse rollback.
8. CRA-128 Preview isolation proof before any non-production runtime test; no runtime test before then.
9. Independent review of object-specific remediation diffs and positive/negative regression tests.

## 8. Safety and release decision

- STAGING DB read-only; no database writes.
- PRODUCTION DB not queried and protected.
- No SQL, ACL, RLS, Auth, schema or data change.
- No payment, email, webhook invocation, OCI test or runtime/E2E.
- No RBAC rollout, onboarding activation or Buyer access enablement.
- No merge or deployment.
- PR #463 remains documentation-only draft; not a certification artifact.

**STAGING:** SECURITY REMEDIATION REQUIRED / NOT CERTIFIED.  
**PRODUCTION:** HOLD / NOT CERTIFIED / NO-GO.

**App-inu pani kittaruthu.**
