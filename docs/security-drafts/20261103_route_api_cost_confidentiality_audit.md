# Crayons Bridge — Route/API and DIT Cost Confidentiality Audit

**Date:** 2026-11-03  
**Scope:** Source-only review on the audit branch; STAGING DB `jbymleftneggcgutlcqu` remains read-only.  
**Production:** HOLD / NOT CERTIFIED / NO-GO.  
**Status:** PARTIAL INVENTORY; P0 source-level confidentiality defect confirmed.

## 1. Executive finding

### P0 — Internal DIT cost and margin returned to external Creator/Studio callers

Source review confirms a customer-facing server function `createServiceQuote` in `src/lib/bridge/service-revenue.ts`:

1. Requires `authMiddleware` and a verified Bridge actor.
2. Authorizes `service.quote_create`.
3. Calculates per-line `costBasisPaise` and `estimatedMarginPaise`, plus aggregate estimated cost and margin.
4. Persists these values to quote/quote-line records.
5. Returns `estimatedCostPaise`, `estimatedMarginPaise`, and the complete `lines` array containing `costBasisPaise` and `estimatedMarginPaise` to the caller.

The same `service.quote_create` permission is granted to `independent_creator` and `studio` account types in `src/lib/bridge/rbac.ts`. Therefore, an external verified Creator/Studio who can operate on their title can invoke this endpoint and receive internal cost and margin values. This is a confirmed source-level confidentiality failure; no live customer invocation or data exposure was performed/observed in this audit.

**Required security boundary:** external quote response may include only approved customer-facing service description, quantity, customer price, tax and payable total. Internal cost basis, estimated/actual margin, internal rates, settlement basis and internal ledger details must remain server-side and available only to specifically authorized Finance/Admin workflows. Use an explicit response DTO allowlist; do not return the internal `lines` object.

Existing tests in `service-revenue.test.ts` test arithmetic only; no response serialization / external-role redaction test was found in the inspected test file.

Evidence:
- `src/lib/bridge/service-revenue.ts` — `createServiceQuote` computes and returns cost/margin fields.
- `src/lib/bridge/rbac.ts` — `independent_creator` and `studio` have `service.quote_create`.
- `src/lib/bridge/service-revenue.test.ts` — current tests cover calculation, not response redaction.

## 2. Route inventory — generated route tree

The audit branch's generated TanStack route tree declares these routes:

| Route | Source component | Initial boundary observation | Status |
|---|---|---|---|
| `/` | `routes/index.tsx` | Public landing | Route source review pending |
| `/account` | `routes/account.tsx` | `RequireBridge`; verified actor profile | Partial |
| `/admin` | `routes/admin.tsx` | `RequireBridge allow="internal"`; page narrows admin/super_admin | Partial |
| `/admin/workstations` | `routes/admin/workstations.tsx` | Nested under admin; inspect independently | Pending |
| `/admin-cms` | `routes/admin-cms.tsx` | Not yet inspected | Pending |
| `/app` | `routes/app.tsx` | Legacy redirect to `/dashboard` | Partial |
| `/buyer` | `routes/buyer.tsx` | `RequireBridge allow="buyer"`; invokes server `listTitles`, own entitlements, payment actions | Partial |
| `/cms` | `routes/cms.tsx` | Not yet inspected | Pending |
| `/contact` | `routes/contact.tsx` | Not yet inspected | Pending |
| `/creator` | `routes/creator.tsx` | `RequireBridge allow="creator"`; title/story submissions | Partial |
| `/dashboard` | `routes/dashboard.tsx` | Uses `getDashboardSession`; Super Admin server session gate | Partial |
| `/deliveries` | `routes/deliveries.tsx` | Not yet fully inspected; uses delivery server functions | Pending |
| `/forgot-password` | `routes/forgot-password.tsx` | Auth surface | Pending |
| `/internal` | `routes/internal.tsx` | Not yet inspected fully | Pending |
| `/investor` | `routes/investor.tsx` | `RequireBridge allow="investor"`; assigned-title read path | Partial |
| `/login` | `routes/login.tsx` | Auth surface | Pending |
| `/loop-cms` | `routes/loop-cms.tsx` | Not yet inspected | Pending |
| `/onboarding` | `routes/onboarding.tsx` | Onboarding/authenticated profile path | Pending |
| `/privacy` | `routes/privacy.tsx` | Public legal page | Pending |
| `/reset-password` | `routes/reset-password.tsx` | Auth surface | Pending |
| `/signup` | `routes/signup.tsx` | Auth surface | Pending |
| `/studio` | `routes/studio.tsx` | `RequireBridge allow="studio"`; owned/organization title and story submissions | Partial |
| `/submit-film` | `routes/submit-film.tsx` | Not yet inspected | Pending |
| `/terms` | `routes/terms.tsx` | Public legal page | Pending |
| `/verify-email` | `routes/verify-email.tsx` | Auth surface | Pending |
| `/workspace` | `routes/workspace.tsx` | `RequireBridge allow="workspace"`; create/list title capability | Partial |
| `/title/$id` | `routes/title.$id.tsx` | Dynamic title detail; inspect server authorization and response fields | Pending |
| `/auth/callback` | `routes/auth/callback.tsx` | Auth callback | Pending |
| `/auth/confirm` | `routes/auth/confirm.tsx` | Auth confirmation | Pending |
| `/api/a2a/` | `routes/api/a2a/index.ts` | Public read-only skill registry response; POST returns accepted/read-only contract | Partial |
| `/api/a2a/agent-card` | `routes/api/a2a/agent-card.ts` | Public agent capability metadata | Partial |
| `/api/auth/$` | `routes/api/auth/$.ts` | GET/POST returns a hard-coded Supabase Production URL | P1 isolation/config finding |
| `/api/razorpay/webhook` | `routes/api/razorpay/webhook.ts` | POST delegates to signed webhook verification; invalid signature 401, transient persistence 503 | Partial |

Generated route-tree source: `src/routeTree.gen.ts` (audit branch).

## 3. Additional confirmed source observations

- `listTitles` is a server function behind `authMiddleware` and `requireVerifiedActor`. Internal users require catalog permission; Buyer results are restricted to buyer-visible statuses and `bridge_title_buyer_visibility`; Creator/Studio path requires `title.read_own` and owner/organization scoping.
- `getTitle` is server-authenticated and checks investor assignment, title ownership/read permission, or buyer publishability. It also returns title event actor IDs and notes; whether any note contains internal-only content requires a data-classification review.
- `resolveBridgeUserId` checks direct `bridge_profiles`, then `bridge_loop_identity_links`, then verified email equality against `auth.users`. This is a transitional identity fallback, not proof that the canonical cross-product identity model is settled.
- Studio organization membership is resolved through `bridge_organization_memberships` and `bridge_organizations`; if absent, organization scope is set to null (fail-closed for organization sharing).
- `/api/auth/$` returns `https://mlmgugivsyoxzdgwkbpu.supabase.co` literally for both GET and POST. The route is in the generated route tree. Code search did not find a consumer of `/api/auth/` in application source; treat actual runtime use as NOT VERIFIED. It is nevertheless an unsafe hard-coded Production reference in an endpoint that may be deployed to Preview and must be reconciled before Preview certification.
- `src/lib/auth/verify.server.ts` instead resolves the Supabase URL from environment aliases and rejects conflicting project URLs. The hard-coded API route bypasses that canonical resolver.

## 4. Access and action mapping — partial

| Surface / action | Caller boundary | Data objects observed | Current assessment |
|---|---|---|---|
| Buyer title catalogue | Buyer role; verified server session | `bridge_titles`, buyer visibility function | Narrowing present in source; test isolation still pending |
| Creator/Studio own title list | Creator/Studio; verified session | `bridge_titles`, organization membership | Owner/org scope present; missing org schema means no org scope |
| Investor title detail | Investor; verified session + assignment | `bridge_title_investors`, `bridge_titles`, `bridge_title_events` | Assignment check present; event note data classification pending |
| Internal Admin dashboard | Internal role plus admin/super_admin page check | titles, audit logs, Loop readiness, profiles | Route/UI check present; each server function needs independent check |
| Service quote | Creator/Studio/Admin roles with `service.quote_create` | service catalog/rates/tax, quote lines, costs/margin | **P0 confidentiality failure — internal costs/margin returned** |
| Buyer license order | Buyer permission, verified session, publishability check | titles, packages, payments, entitlements | Source guards present; provider side effects are not tested |
| Razorpay webhook | Public POST endpoint; provider signature validation in handler | payment, entitlement, audit and order data | Partial; signature/idempotency/DB transaction proof pending |
| A2A registry | Public GET/POST | static skill registry | No business-data execution in inspected handler |

This table is not the complete 32-table route/action matrix. All remaining route modules, server functions, API handlers, table/column accesses, and negative tests remain to be enumerated.

## 5. Required follow-up — no implementation in this audit

1. Raise and track the P0 service quote response confidentiality defect. Remove internal-only fields from external DTOs; preserve internal persistence and Finance-only access.
2. Add serialization tests proving Creator/Studio quote responses do not contain cost basis, internal costs, margin, settlement or ledger fields; add authorized Finance/Admin positive tests.
3. Review all customer-facing service functions for the same data leak, including quote reads, quote acceptance, service order/status, invoices, refunds and settlement.
4. Review `/api/auth/$` hard-coded Production URL and establish Preview behavior without changing environment settings in this audit.
5. Complete all route files, every `createServerFn`, API handlers, data access callsites and table/column mapping.
6. Review title event notes and audit data returned to Buyer/Investor/Creator/Studio.
7. Only after CRA-128 proves Preview isolation may isolated non-production runtime tests be proposed; separate approval remains required.

## 6. Explicit safety boundary

- Read-only source review and read-only STAGING catalog review only.
- No STAGING SQL writes, GRANT/REVOKE, RLS, schema, Auth, or data changes.
- No PRODUCTION DB query or change.
- No Vercel environment change or deployment.
- No payment, email, webhook invocation, title/asset/rights mutation, test identity creation, PR merge or production promotion.
- No RBAC rollout, onboarding activation or Buyer access enablement.

**STAGING:** SECURITY REMEDIATION REQUIRED / NOT CERTIFIED.  
**PRODUCTION:** HOLD / NOT CERTIFIED / NO-GO.  
**App-inu pani kittaruthu.**

## 6. Remediation addendum — 2026-11-03

The P0 quote-response disclosure has a source-level remediation in Draft PR #462:

- Branch: `feat/bridge-loop-commercial-catalogue-20261103`
- Exact head SHA: `142b3e3a50d7a1f5f9078cb5dd5c616d85a80467`
- Added an explicit customer DTO allowlist for `createServiceQuote`; customer responses no longer serialize estimated cost, estimated margin, cost basis, rate IDs/versions, internal classification or evidence.
- Internal pricing calculations and persisted finance data remain server-side.
- DTO and response-wiring regression tests passed on the exact head.
- CI run #1981 and Scope A disposable PostgreSQL run #1005 both completed SUCCESS.

This is a Draft source remediation, not a merged or deployed fix. Supabase Preview was SKIPPED; no STAGING DB or PRODUCTION DB runtime query, migration, customer invocation or payment was performed. The P0 remains release-blocking until the Draft change is reviewed, merged with approval, and verified through the isolated Preview/runtime authorization gates. Do not mark the finding closed based on unit/CI evidence alone.
