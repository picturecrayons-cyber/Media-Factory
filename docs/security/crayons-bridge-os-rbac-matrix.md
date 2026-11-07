# Crayons Bridge OS v1 — Dashboard × Role × Permission × API × RLS Matrix

**Status:** Architecture / inventory draft only. Not an implementation or certification.
**Repository:** `picturecrayons-cyber/Media-Factory`
**Base:** `main` (read-only source inspection; route tree blob `7aeac16b3000e2f6b0231014a25e76401d912a4a`)
**Related Linear work:** [CRA-36 — RBAC matrix](https://linear.app/crayonsbridge/issue/CRA-36/define-rbac-matrix-and-organization-membership-rules), [CRA-153 — Founder Control Centre / dashboard and RBAC audit](https://linear.app/crayonsbridge/issue/CRA-153/p0-reconcile-founder-control-centre-dashboard-title-workflow-and), [CRA-31 — Buyer discovery](https://linear.app/crayonsbridge/issue/CRA-31/build-buyer-dashboard-discovery-and-screener-flows), [CRA-128 — Preview isolation](https://linear.app/crayonsbridge/issue/CRA-128/p0-prove-preview-isolation-and-establish-a-safe-loop-staging-boundary).

## 1. Non-negotiable release and environment boundary

- PRODUCTION = **HOLD / NOT CERTIFIED / NO-GO**.
- This document authorizes no Production changes, deployment, merge, payment, mail send, title/asset/rights mutation, or permission widening.
- **STAGING DB** means approved Testing project `jbymleftneggcgutlcqu`; read-only until a separate explicit approval. No SQL, RLS, grant, Auth, migration, or data writes are authorized here.
- **PRODUCTION DB** means `mlmgugivsyoxzdgwkbpu`; read-only only.
- Do not use historical ref `bbtrosuwisnxacuxvegt`.
- No Preview/E2E/synthetic DB tests until exact Preview server-side Supabase binding and OCI isolation are proven under CRA-128.
- A route guard, UI-hidden button, CI PASS, Vercel READY, or HTTP 200 is not authorization or release certification.
- Zero-regression: **“App-inu pani kittaruthu.”**

## 2. Source-grounded route inventory

The generated `src/routeTree.gen.ts` on the inspected `main` snapshot enumerates the following 33 application routes. Classification below is a first-pass inventory; each route's loader, server function calls, action handlers, nested component actions, and API-level enforcement still require route-by-route verification.

| Route | Initial surface classification | Source evidence / next check |
|---|---|---|
| `/` | Public landing | Public surface; confirm links and no private data |
| `/account` | Authenticated account | Verify own-profile-only reads and safe profile updates |
| `/admin` | Internal admin dashboard | `RequireBridge allow="internal"`; UI additionally checks admin/super_admin |
| `/admin/workstations` | Internal operations dashboard | `RequireBridge allow="internal"`; QC, rights, buyer gate, duplicate review actions need API-level checks |
| `/admin-cms` | Internal website CMS | Internal gate + admin/super_admin UI check; verify `updateHomepageContent` server authorization |
| `/app` | Legacy redirect | Redirects to `/dashboard`; verify target authorization |
| `/buyer` | Buyer dashboard | Buyer-specific contract; must enforce org/title/territory/language/window scope server-side |
| `/cms` | Internal CMS | Internal gate; distinguish from `/admin-cms`; inspect write actions |
| `/contact` | Public contact | No private data; spam/rate-limit controls |
| `/creator` | Creator dashboard | Creator account gate; own-title isolation |
| `/dashboard` | Founder Control Centre | `RequireBridge allow="super_admin"`; exact metric query/reconciliation tracked in CRA-153 |
| `/deliveries` | Delivery dashboard | Inspect role-specific read/write permissions and finance payload redaction |
| `/forgot-password` | Public auth recovery | Rate limit and account enumeration protections |
| `/internal` | Distribution & Operations Desk | `RequireBridge allow="internal"`; invite/publish/revoke actions permission-gated in UI; verify server functions |
| `/investor` | Investor dashboard | Investor assignment and disclosure scope must be server-enforced |
| `/login` | Public auth | Authentication only; no role trust from client metadata |
| `/loop-cms` | Legacy redirect | Redirects to `/internal`; verify no separate authority is created |
| `/onboarding` | Authenticated onboarding | Verify account/org creation and membership proof |
| `/privacy` | Public legal page | No privileged data |
| `/reset-password` | Auth recovery | Recovery session required |
| `/signup` | Public registration | Validate role/account-type allowlist and verified email |
| `/studio` | Studio dashboard | Studio organization membership and title isolation |
| `/submit-film` | Authenticated title intake | Session gate observed; submission server function must enforce creator/studio ownership and validated rights fields |
| `/terms` | Public legal page | No privileged data |
| `/verify-email` | Auth verification | Verify token/session and prevent identity switching |
| `/workspace` | Creator/Studio/internal title workspace | `RequireBridge allow="workspace"`; `title.create` gates create UI; server title APIs must repeat authorization |
| `/title/$id` | Title detail / asset / workflow | `RequireBridge`; per-title ownership/org/role checks required for every read, upload, download, QC, rights, license and publish action |
| `/auth/callback` | Auth callback | Validate return path and identity binding |
| `/auth/confirm` | Auth confirmation alias | Verify token and account state |
| `/api/a2a/` | Agent-to-agent API | Public/service contract; inspect authentication, tool allowlist and data scopes |
| `/api/a2a/agent-card` | Agent discovery metadata | Public metadata only; no private workspace data |
| `/api/auth/$` | Auth provider catch-all | Provider boundary; inspect allowed methods and callback handling |
| `/api/razorpay/webhook` | Payment webhook | Signature verification, idempotency, event-to-user/org/title binding; never a browser-auth route |

**Route inventory evidence:** `src/routeTree.gen.ts`, blob SHA `7aeac16b3000e2f6b0231014a25e76401d912a4a`. This inventory is not proof that all nested routes/actions or APIs are secure.

## 3. Current role model — preserve existing identities

Source file `src/lib/bridge/types.ts` defines external account types:
- `independent_creator`
- `studio`
- `buyer`
- `investor`

It separately defines existing `InternalRole`:
- `admin`
- `super_admin`
- `qc_reviewer`
- `legal_reviewer`
- `finance`
- `viewer`

Do **not** add `internal_admin`, create another Super Admin, or infer authority from email, organization name, user metadata, or UI selection. Internal roles are distinct from external account types. Email verification and server-resolved identity/membership are mandatory.

## 4. Permission catalog observed in source

Current `PERMISSIONS` includes:
`title.ingest_internal`, `title.create`, `title.read_own`, `title.read_catalog`, `title.update_own`, `title.merge_duplicate`, `title.advance_upload`, `title.qc_review`, `title.rights_review`, `title.license`, `title.negotiate`, `title.deliver`, `asset.sign_upload`, `asset.sign_download`, `payment.create_order`, `service.quote_create`, `service.order_create`, `service.fulfill`, `entitlement.read_own`, `finance.read`, `finance.configure`, `finance.record_settlement`, `delivery.read`, `delivery.read_finance`, `users.invite_internal`, `audit.read`, `loop.publish`, `loop.revoke`, `loop.certify_playback`.

The source-level role-to-permission map is in `src/lib/bridge/rbac.ts` (blob SHA `6c39ec4c29127a1e0e52e56baaa093dc7de74f3d`). This is an observed implementation map, not the approved target matrix.

| Actor | Source-observed permission posture | Target boundary / required tests |
|---|---|---|
| `viewer` | Catalog read + audit read | Read-only; no writes, downloads beyond explicit scope, or financial data |
| `qc_reviewer` | Catalog read, QC review, signed download, audit read | QC-only decision authority; no rights/legal/finance/publication |
| `legal_reviewer` | Catalog read, rights review, signed download, audit read | Rights/legal-only authority; no QC/finance/publication |
| `finance` | Finance read/settlement, own entitlement read, audit read | Finance scope only; no QC/legal/publication or unrestricted title mutation |
| `admin` | Broad operational, QC/legal/license/delivery/finance/invite/publish/revoke permissions | Least-privilege admin; require explicit action-level scope and dual control for high-risk approvals |
| `super_admin` | Source currently includes ingest/create/upload and broad operational/publish/revoke permissions | Must not become an implicit global bypass; separate governance actions, require verified identity, explicit permission and audit |
| `independent_creator` | Create/read/update own title, upload/download, service orders, delivery/finance read | Own user + own title scope only |
| `studio` | Similar creator powers | Active server-resolved membership + organization-scoped titles; no organization-name inference |
| `buyer` | Catalog read, payment order, own entitlement read, signed download | Only published + explicitly authorized title, buyer organization, territory, language, media, active window and permitted asset kind |
| `investor` | Own entitlement read in current source | Explicit investor/title assignment and disclosure scope only; no buyer/internal QC/legal access |

**Important source finding:** current `rbac.ts` gives `super_admin` a wider permission set than `admin`, including `title.ingest_internal` and `asset.sign_upload`; `admin` also has sensitive permissions such as finance settlement, internal invites and Loop publication. The current `canAccessDashboard` function restricts Founder Control Centre to verified `super_admin`. These are source observations to review, not approval to preserve or expand.

## 5. Dashboard × role × action target matrix

Legend: **Own** = own user/title; **Org** = active verified organization membership; **Assigned** = explicit title/investor assignment; **Internal scoped** = only the permissioned queue/fields; **No** = deny by default. Every cell must be backed by server-side tests; UI visibility alone is not evidence.

| Surface / action | Creator | Studio | Buyer | Investor | Viewer | QC | Legal | Finance | Admin | Super Admin |
|---|---|---|---|---|---|---|---|---|---|---|
| Creator/Studio title intake | Own | Org | No | No | No | No | No | No | Scoped support only | Explicitly granted |
| Title metadata/assets | Own | Org | Permitted catalog only | Assigned summary | Read scoped | Review scoped | Rights scoped | No | Scoped | Explicitly granted |
| Source master upload | Own | Org | No | No | No | No | No | No | Scoped operational | Explicit permission + audit |
| Master download | Own | Org | No | No | No | Review-only if required | Rights evidence-only if required | No | Scoped | Explicit permission + audit |
| QC decision | No | No | No | No | No | Yes | No | No | Explicitly authorized | Explicitly authorized |
| Rights/legal decision | No | No | No | No | No | No | Yes | No | Explicitly authorized | Explicitly authorized |
| License/territory approval | No | No | Request only | No | No | No | Verify/recommend | No | Controlled approval | Controlled approval |
| Buyer discovery/screener | No | No | Org + active entitlement | No | No | No | No | No | Internal catalog scope | Internal catalog scope |
| Investor disclosure | No | No | No | Assigned | No | No | No | Scoped financial data | Scoped | Scoped |
| Publication / revoke | No | No | No | No | No | No | No | No | Separate publish permission | Separate publish permission |
| Delivery execution | Request/status own | Org-scoped request | Licensed package only | No | No | No | No | No | Delivery permission | Delivery permission |
| Finance / settlement | Own statement only | Org-scoped statement | Own buyer payment only | Assigned disclosure only | No | No | No | Yes | Explicit finance permission | Explicit finance permission |
| Internal user/role management | No | No | No | No | No | No | No | No | Limited grantable roles | Governed, audited |
| Audit ledger | Own activity only | Org activity scoped | Own activity only | Assigned scope | Read scoped | QC events | Legal events | Finance events | Internal scoped | Governance scoped |

This is a proposed deny-by-default target. It must be reconciled with legal/business ownership before code changes.

## 6. API / server-function inventory to trace

Repository search identified server functions across these modules. This is a prioritized module inventory, not a complete function-by-function audit:

| Module | Sensitive actions / data contract | Required server enforcement |
|---|---|---|
| `src/lib/bridge/session.ts` | Resolve Bridge actor/session and organization | Verified identity; role from trusted profile; active membership; no organization-name fallback |
| `src/lib/bridge/titles.ts` | Create/read/update titles, audit logs | Own/Org/Internal scoped checks on every operation |
| `src/lib/bridge/assets.ts` | Upload URL, multipart begin/commit/abort, verify, download URL | Asset kind + title scope + entitlement; master/technical restrictions; audit and storage proof |
| `src/lib/bridge/workflow.ts` | QC/legal/licensing/workflow transitions | Transition-specific permission; state machine; audit |
| `src/lib/bridge/profiles.ts` | Profile sync, internal invites, admin profiles | Verified role grant rules; no self-elevation; identity link constraints |
| `src/lib/bridge/admin-workstations.ts` | Internal queues, QC review, Buyer publication gate | Internal scoped; distinct QC/legal/publish permissions |
| `src/lib/bridge/loop-publication.ts` | Publication readiness, authorize, suspend, revoke, extend window | Legal rights + publication approval + territory/window/medium gates |
| `src/lib/bridge/deliveries.ts` | Delivery traces and finance fields | Delivery permission; redact settlement data by role |
| `src/lib/bridge/payments.ts` + `src/routes/api/razorpay/webhook.ts` | Order creation, fulfillment, webhook entitlement writes | Verified webhook signature, idempotency, exact user + organization + title binding |
| `src/lib/bridge/submissions.ts` | Rights-ready submission and screener metadata | Creator/Studio ownership; evidence status separate from user attestation |
| `src/lib/bridge/commercial-admin.ts`, `service-revenue.ts` | Rates, quotes, service orders, revenue | Finance/admin permission and organization scope |
| `src/lib/bridge/duplicate-reconciliation.ts` | Duplicate review/merge | Explicit merge permission, preview/dry-run, irreversible-action audit |
| `src/lib/loop/catalog.ts` | Loop catalog reads | Published + authorized + active window + territory/language/platform/entitlement |
| `src/routes/api/a2a/*` | Agent discovery / A2A actions | Explicit auth, per-tool allowlist, tenant scope, no privileged action via public metadata |

## 7. RLS / database boundary

**STAGING DB — `jbymleftneggcgutlcqu` (read-only):** the latest recorded audit says 32 public tables have RLS enabled but zero public policies; 17 tables had broad direct anon/authenticated grants (238 grant rows) and 1,576 direct column-grant rows; sequences and default privileges also need object-by-object review. This is a blocker, not a safe staging authorization layer.

**PRODUCTION DB — `mlmgugivsyoxzdgwkbpu` (read-only):** do not use for tests or remediation. Production remains HOLD / NOT CERTIFIED / NO-GO.

Repository migrations `0012_bridge_rls_identity_binding.sql` and `0015_delivery_trace_finance.sql` contain policy definitions, but the existence of SQL in GitHub does not prove those policies are applied to either database. Migration 0012 also describes server-authoritative access and scoped SELECT policies; reconcile migration history and live catalog evidence before any proposal.

Required object-by-object RLS/grant matrix fields:
- schema / table / column / sequence / function;
- owner and dependency;
- anon, authenticated, service_role, PUBLIC and inherited role privileges;
- RLS enabled/forced, each policy command/role/USING/WITH CHECK;
- server-only access path and whether service-role bypass is intentional;
- organization/title ownership join;
- positive and negative test cases;
- migration order, backup, rollback and independent review.

Do not apply blanket ACL/default-privilege changes. Do not run migrations in this task.

## 8. Buyer A/B isolation and entitlement contract

- Buyer A and Buyer B must be distinct synthetic users in distinct organizations.
- Buyer organization ID comes only from an active server-side membership joined to an active organization row.
- Entitlement must match exact `user_id + organization_id + title_id`; no organization scope or legacy row without `organization_id` fails closed.
- Also check publication authorization, territory, language, exploitation/media, start/end window, exclusivity, revocation and asset kind.
- Buyer cannot see internal QC/legal notes, master media, technical package, another buyer's payment/entitlement, or unassigned titles.
- Existing payment fulfillment and Razorpay webhook writers were recorded as writing entitlements without `organization_id`. This compatibility gap blocks legitimate scoped downloads until separately reviewed STAGING-only schema and writer plan; no real payment/webhook test is allowed.

## 9. Required verification matrix

| Test | Expected result | Status |
|---|---|---|
| Unverified email → protected dashboard | Deny | NOT VERIFIED |
| Buyer A → Buyer B title/entitlement/payment | Deny | NOT VERIFIED |
| Studio A → Studio B title/assets | Deny | NOT VERIFIED |
| Buyer → draft/unpublished/unauthorized/expired title | Deny | NOT VERIFIED |
| Buyer → master/technical asset | Deny | NOT VERIFIED |
| Buyer → entitled screener/subtitle in exact scope | Allow only after entitlement writer/schema contract is resolved | BLOCKED |
| QC → rights/finance/publication mutation | Deny | NOT VERIFIED |
| Legal → QC/finance/publication mutation | Deny | NOT VERIFIED |
| Finance → QC/legal/publication mutation | Deny | NOT VERIFIED |
| Viewer → any write endpoint | Deny | NOT VERIFIED |
| Creator → another creator's title/assets | Deny | NOT VERIFIED |
| Investor → unassigned title or buyer-only data | Deny | NOT VERIFIED |
| Admin/Super Admin high-risk action | Explicit permission, scope, audit; no blanket bypass | NOT VERIFIED |
| API direct invocation bypassing UI | Same authorization as UI | NOT VERIFIED |
| RLS direct Data API access | Deny unless explicit least-privilege policy exists | BLOCKED |
| Webhook replay / wrong org or title | Reject or idempotently no-op | NOT VERIFIED |

Do not execute these tests against Production. Synthetic test execution is blocked until CRA-128 proves Preview isolation and the STAGING DB access plan is separately reviewed and approved.

## 10. Delivery sequence / acceptance gates

1. Complete route inventory and identify all nested components, server functions, API handlers, mutations and sensitive actions.
2. Finalize the permission catalog and role/action matrix with deny-by-default semantics.
3. Reconcile existing roles without creating identities or changing Super Admin membership.
4. Trace every server function and ensure it calls a shared authorization primitive (or documents a justified public/webhook exception).
5. Produce a table/column/sequence/function-level STAGING RLS and grants proposal with migration order and rollback; do not apply it.
6. Resolve Buyer entitlement organization scope as a separately reviewed STAGING-only design.
7. Prove CRA-128 Preview/database/OCI isolation before synthetic tests.
8. Run positive + negative route/API tests, Buyer A/B and Studio A/B isolation tests, asset-kind tests, webhook replay tests and audit assertions in isolated non-production.
9. Independent review and exact-head CI/Preview evidence.
10. Only then request separate Production rollout approval.

**Acceptance:** every route/action/API has an owning permission, scope, server enforcement point, RLS expectation, audit event, positive/negative test, and status. No unverified route is marked PASS.

**Current release decision:** Complete dashboard RBAC — NOT CERTIFIED; Buyer A/B isolation — NOT CERTIFIED; backend authorization — NOT VERIFIED; STAGING DB RLS — BLOCKED; Production — **HOLD / NOT CERTIFIED / NO-GO**.
