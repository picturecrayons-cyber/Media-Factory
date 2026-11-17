# Bridge Production Security Remediation — Draft Plan

**Status:** DRAFT / NOT APPROVED FOR EXECUTION  
**Prepared:** 2026-11-18  
**Source baseline:** `main` at `73e33e342596e6f6f9e6c0b82f4b986136417457`; PR #703 reviewed at `0151295c6dd9aff47e0973bcea5922dc3b0dfaad`  
**Release rule:** App-inu pani kittaruthu. Production remains HOLD / NOT CERTIFIED / NO-GO.

## 1. Scope and non-goals

This document records a source-backed corrective plan only. It does not contain an executable production migration and does not authorize:
- Production or Testing DB writes, privilege revokes, RLS changes, function changes, or migration application;
- merge, promotion, Production deployment, payment, settlement, customer email, or external media/storage operations.

No live data is to be copied into local or test fixtures. Tests must use synthetic disposable data.

## 2. Findings from source review

### 2.1 Legacy browser grants

Production read-only catalog verification found `anon` and `authenticated` with all seven table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on:
- `public.orders`
- `public.titles`
- `public.user_entitlements`

The three tables have RLS enabled and zero policies. RLS does not protect TRUNCATE.

**Source search result (main baseline):**
- No direct application-code references to `public.orders`, `public.titles`, or `public.user_entitlements` were returned by repository code search.
- Search hits for “orders” were separate objects such as `streamvista_orders`, `bridge_service_orders`, and Razorpay `/orders`; these are not the legacy `public.orders` table.
- Search hits for “titles” primarily use `bridge_titles`, not legacy `public.titles`.
- No `user_entitlements` source hit was returned.
- This is evidence of no indexed direct consumer, **not proof of no consumer**. Search can miss dynamic SQL, external clients, old deployed bundles, scheduled jobs, integrations, and out-of-repository consumers.

**Plan:** inventory schema dependencies, views, triggers, functions, policies, jobs, API logs, external integrations, and historical app versions. Build a consumer matrix per legacy table. Do not revoke until every consumer has an owner, replacement path, and regression coverage. Prefer a narrow, reviewed privilege change only after proving the app uses server-side canonical tables and no legitimate browser client needs the legacy tables. No blanket grant changes.

### 2.2 SECURITY DEFINER owner helper

Production advisor identifies:
`public.bridge_is_title_owner(p_title_id text)`
- SECURITY DEFINER
- EXECUTE: authenticated = true; anon = false
- `search_path = pg_catalog`, `row_security = off`

Source:
- `supabase/migrations/20261115164711_bridge_production_owner_rls_helper.sql` defines the function and grants EXECUTE to authenticated.
- `supabase/migrations/20261116090923_bridge_title_owner_helper_search_path_hardening_20261116.sql` hardens search_path and revokes PUBLIC/anon while retaining authenticated EXECUTE.
- The function is called by the SELECT/INSERT/UPDATE/DELETE RLS policies on `public.bridge_production_assets`.

**Plan:** do not blindly revoke authenticated EXECUTE; that would break the policies that call it. Review function owner, body, grants, policy dependency, and actor mapping. Add tests for own-title allow, other-title deny, null/unauthenticated deny, forged title ID, and policy operations. Keep function narrow and schema-qualified; consider moving it to a non-exposed schema only with policy/deployment compatibility tests. SECURITY DEFINER must remain only if the policy design demonstrably requires it.

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
| SEC-01 | Legacy table consumer/dependency inventory | table-by-table consumer matrix; grants; views/functions/triggers/jobs; API log evidence | READ-ONLY |
| SEC-02 | Legacy grant remediation proposal | least-privilege matrix; explicit compatibility tests; rollback plan | Draft only |
| SEC-03 | SECURITY DEFINER helper review | function body/owner/grants; policy dependency graph; adversarial tests | READ-ONLY |
| ID-01 | PR #703 migration review | exact-head replay, fixture/constraint tests, identity preservation, idempotency | Draft PR only |
| RLS-01 | 27 advisor finding classification | table, RLS, grants, policies, intended access, owning code path | READ-ONLY |
| AUTH-01 | Leaked-password protection plan | impact assessment and separate configuration approval | No change |
| REG-01 | Regression and release gate | typecheck, lint, tests, migration replay, role isolation, app workflow regression | Disposable/local or approved Staging only |

## 4. Mandatory regression matrix

- Anonymous browser role: cannot read or mutate private Bridge operational, payment, identity, entitlement, audit, or publication data.
- Authenticated non-owner: cannot access another creator's production assets or private title data.
- Creator/Studio/Buyer/Investor: only their documented permissions and organization/title scope.
- Admin/Super Admin: distinct privileged checks; all privileged actions audited.
- `bridge_is_title_owner`: owner allowed, non-owner denied, unauthenticated denied; policy behavior preserved.
- Identity: direct Bridge profile mapping, verified Supabase identity mapping, duplicate links, missing profile, orphan detection, legacy `account`/`session` integrity.
- Payments and entitlements: existing Bridge canonical tables unaffected; no live provider call in tests.
- Negative cases: wrong account type, missing FK, duplicate FK, unexpected FK target, duplicate identity, migration rerun.

## 5. Sequencing and gates

1. Complete SEC-01 and RLS-01 inventory without changing grants.
2. Complete SEC-03 function/policy dependency review.
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
- every legacy table has a verified consumer disposition;
- browser grants match the approved least-privilege matrix;
- every RLS-no-policy finding has an explicit rationale;
- the owner helper is proven safe and its policy dependency preserved;
- identity migration passes exact-head replay and independent review;
- role-based negative and positive tests pass;
- no app regression is observed;
- Production remains untouched until a separate release authorization.
