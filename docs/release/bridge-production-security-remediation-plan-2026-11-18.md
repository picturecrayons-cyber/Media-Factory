# Bridge Production Security Remediation — Draft Plan

**Status:** DRAFT / NOT APPROVED FOR EXECUTION  
**Prepared:** 2026-11-18  
**Source baseline:** `main` at `73e33e342596e6f6f9e6c0b82f4b986136417457`; PR #703 reviewed at `0151295c6dd9aff47e0973bcea5922dc3b0dfaad`  
**Production catalog snapshot:** READ-ONLY review on 2026-11-18  
**Release rule:** App-inu pani kittaruthu. Production remains HOLD / NOT CERTIFIED / NO-GO.

## 1. Scope and non-goals

This document records a source-backed corrective plan only. It does not contain an executable production migration and does not authorize:
- Production or Testing DB writes, privilege revokes, RLS changes, function changes, or migration application;
- merge, promotion, Production deployment, payment, settlement, customer email, or external media/storage operations.

No live data is to be copied into local or test fixtures. Tests must use synthetic disposable data.

## 2. Findings

### 2.1 Legacy browser grants — DB evidence confirmed; consumers not fully cleared

Production READ-ONLY catalog verification confirms `anon` and `authenticated` have all seven table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on:
- `public.orders`
- `public.titles`
- `public.user_entitlements`

All three have RLS enabled, FORCE RLS disabled, and zero RLS policies. RLS does not protect TRUNCATE. Current effective table ACL also includes `service_role` and `postgres`.

**Production schema dependency inventory (READ-ONLY, 2026-11-18):**
- `public.orders.title_slug → public.titles.slug` (FK `orders_title_slug_fkey`).
- `public.user_entitlements.title_slug → public.titles.slug` (FK `user_entitlements_title_slug_fkey`).
- No other FK references to these three tables were returned by the catalog query.
- No views, triggers, or RLS policies on these three tables were returned by the inspected catalogs.
- A scan of public routine definitions for references to these three legacy relations returned no routine-text hits.
- This does **not** prove there are no external consumers, dynamic SQL, edge functions, scheduled jobs, deployed older clients, API/Data API callers, or integrations.

**GitHub source inventory (main baseline):**
- Searches for `public.orders`, `public.titles`, `public.user_entitlements`, and `user_entitlements` returned no direct application-code callsites.
- Generic “orders” matches are distinct Bridge/StreamVista order objects (`streamvista_orders`, `bridge_service_orders`) or the Razorpay `/orders` endpoint, not the legacy `public.orders` table.
- The repo uses canonical `bridge_titles`, `bridge_payments`, and `bridge_entitlements` paths in the reviewed Bridge workflows.
- Search-index absence is not proof of no consumer. Dynamic SQL, external clients, old deployed bundles, scheduled jobs, integrations, and out-of-repository consumers remain unverified.

**Consumer disposition matrix:**

| Legacy relation | In-repo direct app consumer | DB dependency found | Current disposition |
|---|---|---|---|
| `public.orders` | No match in indexed main source | FK child of `public.titles` via `title_slug` | External/runtime consumer NOT VERIFIED |
| `public.titles` | No match in indexed main source | Parent of `orders` and `user_entitlements` | Cannot classify unused; retain pending evidence |
| `public.user_entitlements` | No match in indexed main source | FK child of `public.titles` via `title_slug` | External/runtime consumer NOT VERIFIED |

**SEC-01 status: PARTIAL / NOT CLEARED.** Catalog and source inventories are complete for the inspected scope, but API logs, edge functions, cron/jobs, older deployed versions, third-party clients, and real usage telemetry were not available in this review. No grant revoke is safe to propose as execution-ready yet.

**Plan:** identify data owner and business meaning for every legacy row; inspect Supabase API logs and scheduled/edge functions; search all deployed client versions and connected integrations; confirm whether legacy Loop code or an older application still queries these tables; build synthetic compatibility tests and a rollback plan. Only then prepare a narrow least-privilege change. No blanket grant changes.

### 2.2 SECURITY DEFINER owner helper — policy dependency confirmed

Production READ-ONLY catalog verification confirms:
`public.bridge_is_title_owner(p_title_id text)`
- owner: `postgres`
- SECURITY DEFINER = true; STABLE
- `search_path = pg_catalog`; `row_security = off`
- function body joins `public.bridge_titles` to `public.bridge_loop_identity_links` on `bridge_user_id = owner_user_id`, and checks `l.auth_user_id = (SELECT auth.uid())`
- effective EXECUTE ACL: `postgres`, `authenticated`, and `service_role`; no `anon` or PUBLIC entry was returned.
- four RLS policies on `public.bridge_production_assets` call this function: SELECT, INSERT, UPDATE, DELETE. Catalog dependency records confirm policy dependencies.

Source:
- `supabase/migrations/20261115164711_bridge_production_owner_rls_helper.sql` defines the function and owner policies.
- `supabase/migrations/20261116090923_bridge_title_owner_helper_search_path_hardening_20261116.sql` hardens search_path and revokes PUBLIC/anon while retaining authenticated EXECUTE.

**Review conclusion:** the function is a live authorization dependency, not an unused helper. Do not revoke authenticated EXECUTE or alter/drop the function without replacing and testing all four policies. The live ACL also includes `service_role`; confirm whether that is expected from inherited/default grants and keep it documented.

**Not yet verified:** adversarial execution tests for own-title/non-owner/null auth, forged title IDs, role switching, RLS behavior, and whether `row_security=off` is necessary. Function safety is NOT CERTIFIED by catalog inspection alone.

### 2.3 Identity FK parity — PR #703

Production currently has:
`bridge_loop_identity_links.bridge_user_id → public.user(id)`
while Testing has:
`bridge_loop_identity_links.bridge_user_id → public.bridge_profiles(user_id)`.

Production has 6 Bridge profiles, 6 identity links, and 0 profile-orphan links. The legacy `public.user` remains referenced by `public.account.userId` and `public.session.userId`; PR #703 explicitly preserves these legacy auth tables.

PR #703:
- Head: `0151295c6dd9aff47e0973bcea5922dc3b0dfaad`
- Migration: `supabase/migrations/20261118120000_bridge_identity_link_fk_parity_20261118.sql`
- Migration changes only the identity-link FK, with fail-closed preconditions and orphan validation.
- **Latest exact-head checks currently report success, including `supabase-migration-replay`.** An earlier replay attempt reported `bridge_profiles_account_type_chk`; that historical failure is not the latest check result and must not be represented as a current failing check.
- Migration replay script seeds a synthetic `independent_creator` fixture for this migration. The current `migrations/0016_investor_account_type.sql` allows four account types: `independent_creator`, `studio`, `buyer`, `investor`. Earlier `migrations/0004_bridge.sql` allows only three, so migration ordering/parity must remain explicitly tested.

**Plan:** retain PR #703 as Draft. Independently review the migration and replay fixture; verify constraint state immediately before any future apply; add assertions that all six mapped production identity rows remain unchanged and that account/session legacy FKs are untouched. Add idempotency and unexpected-FK negative tests. Do not apply this migration to either hosted DB under this plan.

### 2.4 RLS-no-policy and Auth hardening

Production advisor currently reports 27 RLS-enabled/no-policy findings, including the three legacy tables and Bridge operational tables. A table with RLS enabled and no policies is commonly server-only if browser grants are absent; it is not automatically a vulnerability. Each table must be assessed against its grants and server access model.

Leaked-password protection is disabled.

**Plan:** classify each finding:
1. server-only table with browser privileges revoked — document expected state;
2. browser-accessible table — require explicit least-privilege policies and role tests;
3. legacy/unused table — prove consumer absence before access changes.

Auth leaked-password protection should be enabled only through a separately approved Auth configuration change, after checking user impact and rollout behavior. This draft does not change Auth settings.

## 3. Corrective work packages

| ID | Work package | Required evidence | Current access |
|---|---|---|---|
| SEC-01 | Legacy consumer/dependency inventory | FK graph and source search complete for inspected scope; API logs, cron/edge, deployed clients and external consumer proof still outstanding | READ-ONLY / PARTIAL |
| SEC-02 | Legacy grant remediation proposal | least-privilege matrix; explicit compatibility tests; rollback plan; consumer sign-off | Draft only / BLOCKED |
| SEC-03 | SECURITY DEFINER helper review | function body/owner/grants and four policy dependencies inspected; adversarial tests outstanding | READ-ONLY / PARTIAL |
| ID-01 | PR #703 migration review | exact-head replay, fixture/constraint tests, identity preservation, idempotency | Draft PR only |
| RLS-01 | 27 advisor finding classification | table, RLS, grants, policies, intended access, owning code path | READ-ONLY |
| AUTH-01 | Leaked-password protection plan | impact assessment and separate configuration approval | No change |
| REG-01 | Regression and release gate | typecheck, lint, tests, migration replay, role isolation, app workflow regression | Disposable/local or approved Staging only |

## 4. Mandatory regression matrix

- Anonymous browser role: cannot read or mutate private Bridge operational, payment, identity, entitlement, audit, or publication data.
- Authenticated non-owner: cannot access another creator's production assets or private title data.
- Creator/Studio/Buyer/Investor: only their documented permissions and organization/title scope.
- Admin/Super Admin: distinct privileged checks; all privileged actions audited.
- `bridge_is_title_owner`: owner allowed, non-owner denied, unauthenticated denied; policy behavior preserved; test authenticated and service_role execution paths explicitly.
- Identity: direct Bridge profile mapping, verified Supabase identity mapping, duplicate links, missing profile, orphan detection, legacy `account`/`session` integrity.
- Legacy tables: confirm all historical Loop/Bridge flows and external clients before any grant reduction; verify FK insert/update/delete semantics with disposable fixtures.
- Payments and entitlements: existing Bridge canonical tables unaffected; no live provider call in tests.
- Negative cases: wrong account type, missing FK, duplicate FK, unexpected FK target, duplicate identity, migration rerun.

## 5. Sequencing and gates

1. SEC-01 catalog and source search completed for inspected scope; close remaining telemetry/external-client gaps before any legacy grant change.
2. Complete SEC-03 adversarial tests and confirm helper ACL/policy behavior; preserve current policy dependencies meanwhile.
3. Reconcile PR #703 history and exact-head replay; preserve Draft.
4. Prepare separate Draft-only code/migration proposals with automated regression tests.
5. Validate only on disposable local Supabase first. Staging hosted writes require a separate explicit approval and a compatibility snapshot.
6. Independent review and owner approval for each proposed change.
7. Production changes, if ever considered, require a separate explicit approval, maintenance/rollback plan, pre/post verification, and a separately approved release window.

## 6. Database and deployment safety

- **PRODUCTION DB `mlmgugivsyoxzdgwkbpu`:** Action = audit only; Access = READ-ONLY; Risk = HOLD / NOT CERTIFIED / NO-GO. No grants, policies, functions, identity links, or Auth settings changed.
- **STAGING DB `jbymleftneggcgutlcqu`:** Action = compatibility verification only; Access = READ-ONLY; Risk = no writes or migration apply.
- **GitHub:** this document is a Draft-only planning artifact on an isolated branch. No application source or migration is changed by this plan.
- **Vercel:** no deployment or environment change.
- **Budget:** ₹0; no paid upgrade or service.

## 7. Exit criteria

This security workstream is not complete until:
- every legacy table has a verified consumer disposition, including external and historical clients;
- browser grants match the approved least-privilege matrix;
- every RLS-no-policy finding has an explicit rationale;
- the owner helper is proven safe and its policy dependency preserved;
- identity migration passes exact-head replay and independent review;
- role-based negative and positive tests pass;
- no app regression is observed;
- Production remains untouched until a separate release authorization.
