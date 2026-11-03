# Crayons Bridge — Source Access Audit Batch 2

**Date:** 2026-11-03  
**Repository:** `picturecrayons-cyber/Media-Factory`  
**Branch:** `audit/staging-rls-acl-remediation-proposal-20261103`  
**Mode:** GitHub source-only inspection. STAGING DB `jbymleftneggcgutlcqu` remains read-only; PRODUCTION DB `mlmgugivsyoxzdgwkbpu` excluded.  
**Status:** Additional evidence captured; audit remains INCOMPLETE.

## 1. New source files inspected

| File | Observed source evidence |
|---|---|
| `src/lib/bridge/service-revenue.ts` | 12 exported functions; reads/writes across 17 commercial/title/payment objects |
| `src/lib/bridge/titles.ts` | `listTitles`, `getTitle`, `listAuditLogs`; title events, grants, QC/legal and audit access |
| `src/lib/bridge/assets.ts` | Upload/multipart/download/list assets; object key handling and entitlement checks |
| `src/lib/bridge/deliveries.ts` | `listDeliveryTraces` delegates to role-aware reader |
| `src/lib/bridge/workflow.ts` | Rights/QC/legal workflow, revenue and settlement evidence functions |
| `src/lib/bridge/profiles.ts` | Onboarding, identity links, invite/profile/org writes |
| `src/lib/supabase.ts` | Browser Supabase client created with publishable key; full import/callsite inventory remains open |
| `src/routes/title.$id.tsx` | Title page invokes `getTitle`, `listTitleAssets`, `getLoopPublication`, and workflow reads |

## 2. Confirmed / material response-boundary findings

### A. P0 — service quote response remains confirmed

`createServiceQuote`:
- `authMiddleware`, verified actor and `service.quote_create` permission are required.
- RBAC grants `service.quote_create` to `independent_creator` and `studio`.
- Response contains `estimatedCostPaise`, `estimatedMarginPaise` and raw `lines` including `costBasisPaise` and `estimatedMarginPaise`.
- This remains a confirmed source-level confidentiality failure. No live request/data access was performed.

### B. P1 review required — title event notes returned to all authorized title readers

`getTitle` returns every `bridge_title_events` row with `actorUserId` and `note`. The same handler permits:
- assigned Investor after investor assignment check;
- Buyer after buyer publishability check;
- Creator/Studio/internal readers that pass `canReadTitle`.

Source search shows event notes are written by workflow/admin review paths from reviewer-provided `data.note` / `data.notes`; QC and legal review findings are also persisted separately. Therefore internal workflow notes can be placed in a field that the Buyer/Investor `getTitle` response includes. The exact note content and live audience exposure were not inspected; no actual disclosure is asserted. Required next proof: classify note producers and consumers, then apply audience-specific DTO tests. Treat as a response data-minimization / confidentiality risk until proven safe.

### C. P1 review required — workflow response exposes QC findings and rights evidence to non-Buyer title readers

`getTitleWorkflow` rejects Buyer (unless internal), but otherwise permits any verified actor who can read the title. Its response includes:
- rights grant territories, languages, dates, exclusivity and `evidence`;
- QC `reviewer_findings`, including note, `masterKey`, `posterKey`;
- legal status and review timestamp.

The route-level caller `src/routes/title.$id.tsx` enables this query for internal actors and every non-Buyer account type. This includes Creator/Studio/Investor classes if they pass `canReadTitle`. Whether those fields are appropriate for each audience is NOT VERIFIED. Internal QC notes, rights evidence and storage object keys require field-by-field audience classification. No live data was read.

### D. P1 review required — title revenue endpoint uses an OR permission gate

`getTitleRevenue` authorizes `canOperateOnTitle(actor, title, "title.read_own", "finance.read")`. The response includes Loop payment identifiers, order identifiers, purchase timestamps, amounts/currency and settlement-evidence audit metadata. The UI gates its display with `canFinance`, but UI gating is not a server authorization boundary. Verify the exact `canOperateOnTitle` semantics and role matrix; prove that Creator/Studio title owners are or are not intended to receive these financial details. Until policy is documented and negative tests exist, mark finance audience control NOT VERIFIED. Do not assert a confirmed leak without resolving the helper semantics and intended owner entitlement.

### E. Asset object key response

`listTitleAssets` checks `canReadTitle`; for Buyer it hides keys and filters master/technical/censor certificate kinds. For non-Buyer readers it returns `s3_key` as `key`. This is object-key metadata, not a signed URL or proof of access. Confirm whether Creator/Studio/Investor/internal roles should receive storage key identifiers; add tests that object keys are not usable as credentials and that sensitive asset classes are audience-restricted.

`requestAssetDownload` requires `asset.sign_download`, title read access, and entitlement decision before signing. This is a source guard, not runtime proof. Signed URL TTL, key scope and Buyer/Creator/Studio download matrix still require tests.

## 3. Commercial function call-chain evidence

| Function | Source role / caller | Internal data / response conclusion |
|---|---|---|
| `createServiceQuote` | Creator/Studio/Admin-capable permission | **P0 FAIL** — internal cost/margin in returned DTO |
| `acceptServiceQuote` | verified actor + `service.order_create`; quote `user_id` must match | Returns order/quote IDs, customer amount and currency; no internal cost observed in returned object |
| `createServicePaymentOrderFn` | verified actor + `service.order_create` | delegates to order/payment creation; full nested return and retry paths need final review |
| `verifyServicePayment` | verified actor + Razorpay signature check | delegates to capture; provider signature check source observed |
| `captureServicePayment` | internal helper called by verify and webhook | Reads quote-line `cost_basis_paise` for ledger/settlement; creates invoice from customer subtotal/tax/total. Caller-facing return DTO and transaction/idempotency behaviour require completion |
| `processServiceRefund` | internal helper called by verified webhook path in inspected source | Updates customer refund totals and internal ledger; no direct customer server function found by current code search; webhook idempotency/call chain remains PARTIAL |
| `processServiceChargeback` | internal helper called by webhook path | Updates internal chargeback ledger; return includes order/payment IDs, amount and status; external customer invocation not found in current search |
| `recordServiceActualCost` | `finance.configure` | writes internal actual costs; no mapped role was previously found with this permission; finance workflow authorization gap remains |
| `getCommercialFinancialSummary` | `finance.read` | returns operating costs, fees, settlement and net-profit totals |
| `ingestRazorpayWebhook` | signed webhook handler | processes captured/refund/dispute events with event hash/status/claim token; end-to-end replay/concurrency/transaction proof remains incomplete |

Current source search found invoice creation and refund-status updates, but no customer-facing invoice reader in the inspected commercial module. This is NOT proof that no invoice reader exists elsewhere. Repository-wide search and route callsite reconciliation remain required.

## 4. Additional route-to-data mappings

| Server function | Objects read/written | Audience / authorization evidence |
|---|---|---|
| `listTitles` | `bridge_titles`, buyer visibility helper, org membership via helper | Internal catalog permission; Buyer published/visible filter; Creator/Studio own/org scope |
| `getTitle` | title, `bridge_title_events`, investor assignment | Investor assignment / buyer publishability / canReadTitle; event notes unfiltered |
| `listAuditLogs` | `bridge_audit_logs` | `audit.read`; returns actor, action, entity, metadata |
| `getTitleWorkflow` | rights grants, QC cases, legal cases | non-Buyer canReadTitle; sensitive evidence fields require audience matrix |
| `getTitleRevenue` | Loop payment events/TVOD entitlements, Bridge audit logs, rights grants and revenue evidence | OR check of `title.read_own` or `finance.read`; audience intent NOT VERIFIED |
| `listTitleAssets` | `bridge_assets` | canReadTitle; Buyer keys hidden, non-Buyer key returned |
| `requestAssetDownload` | `bridge_assets`, entitlement/title | `asset.sign_download`, canReadTitle, entitlement decision |
| `syncSupabaseSessionUser` / `completeOnboarding` | profiles, identity links, invites, orgs/memberships | verified email; identity link insertion and invite consumption; canonical identity reconciliation remains blocked |
| `listDeliveryTraces` | delegated to `readDeliveryTraces` | verified actor; detailed internal permission/scope proof remains pending |

## 5. Browser Supabase client evidence

`src/lib/supabase.ts` constructs a browser Supabase client with publishable key and persistent Auth session. Current repository code search returned a direct `.from()` hit in `supabase/functions/razorpay-webhook/index.ts`, not a confirmed browser component callsite. Search coverage is not exhaustive. Complete imports and all client methods (`.from`, `.rpc`, Storage, Auth) still must be enumerated before asserting browser Data API is unused.

## 6. Remaining audit work

1. Resolve `canOperateOnTitle` and `canReadTitle` exact semantics and test matrix for Creator, Studio, Buyer, Investor and each internal role.
2. Inventory every title event note producer and classify note audience; ensure buyer/investor DTO cannot expose internal QC/legal/admin notes.
3. Review `getTitleWorkflow` rights evidence and QC reviewer findings field-by-field; test unauthorized role and cross-tenant cases.
4. Review `getTitleRevenue` server permission and data policy; UI `canFinance` is not sufficient.
5. Complete commercial response DTOs for quote reads, invoices, orders, refunds, settlements and nested helpers; identify all callers.
6. Complete direct browser Supabase client imports and method callsites.
7. Complete every route and every server function/API/background task mapping to all 32 tables.
8. Continue CRA-128 Preview isolation and exact migration SHA-256/identity/rollback evidence as separate gates.

## 7. Safety

No code implementation, DB write, SQL, ACL, RLS, Auth, data mutation, runtime/E2E, payment, email, webhook invocation, RBAC rollout, merge or deployment was performed.

**P0:** FAIL / OPEN.  
**STAGING:** SECURITY REMEDIATION REQUIRED / NOT CERTIFIED.  
**PRODUCTION:** HOLD / NOT CERTIFIED / NO-GO.  
**App-inu pani kittaruthu.**
