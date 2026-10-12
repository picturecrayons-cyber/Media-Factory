# Bridge RBAC and title-scope audit — 2026-10-12

## Scope and safety

This is a read-only code review record. No production configuration, database, deployment, role assignment, or title record was changed. Findings below are limited to the inspected `main` source files and must be revalidated against the eventual PR head.

## Verified source findings

### `src/lib/bridge/rbac.ts`

- Internal roles are explicitly mapped to permissions in `INTERNAL_PERMISSIONS`.
- Studio and independent-creator permissions are mapped separately in `ACCOUNT_PERMISSIONS`.
- `permissionsFor` gives an internal role precedence over account-type permissions, preventing accidental privilege widening from a staff account's account type.
- `hasPermission` requires email verification and delegates to staff or account permissions.
- `canReadTitle` allows a non-staff account to read its own title only when `title.read_own` is granted; internal staff need `title.read_catalog`; buyers are limited to selected lifecycle statuses.
- `canAccessDashboard` requires verified email and the `super_admin` role.
- `canGrantInternalRole` allows `admin` and `super_admin` to grant roles in the role-grant matrix. This high-impact capability needs explicit product/security approval and tests.

### `src/lib/bridge/session.ts`

- `getDashboardSession` is server-side and rejects actors without the super-admin gate.
- `requireActorPermission` delegates to the RBAC assertion.
- Actor/profile resolution reads `bridge_profiles` and may resolve legacy identity by matching a confirmed Supabase email.
- This file alone does not prove every server function, route handler, or database query calls the appropriate permission and ownership checks.

### `src/lib/bridge/env.ts`

- OCI integration status is based on presence of required environment variables, not successful OCI authentication or object operations. A green `integrationStatus().oci` must not be presented as proof of storage readiness.
- The OCI 401 must remain a separate operational blocker until signed requests and upload/HEAD/download verification pass.

## Risk items requiring route-level verification

1. Search every server function and API route that reads or mutates titles, grants, users, storage, publishing, delivery, finance, or OCI diagnostics. Record the permission asserted at the server boundary and the owner/tenant predicate used by the data query.
2. Verify that Studio users cannot invoke internal OCI diagnostics even if they manually call the endpoint. Hiding a button is not an authorization control.
3. Verify that Studio title queries filter by the authenticated Bridge user/tenant and that admin catalog queries intentionally have broader scope. The reported six-title versus empty-admin view is not, by itself, proof of a defect.
4. Review whether `delivery.read_finance` is appropriate for studio and independent-creator accounts; do not remove it until the intended account-facing finance UI and API contracts are checked.
5. Test role grants, title ownership, lifecycle transitions, and unauthorized requests at API level. Include negative tests for unverified users, studio-to-other-studio reads/writes, viewer-to-admin operations, and non-super-admin OCI diagnostics.
6. Review RLS/policies and privileged database connection usage separately. Application RBAC does not substitute for appropriate database access controls.

## Acceptance gates before merge

- Exact-head CI passes.
- Unit tests cover the role-permission matrix, owner/tenant isolation, title transitions, and denied requests.
- Route inventory demonstrates authorization at every sensitive server boundary.
- Preview deployment SHA matches the reviewed PR head.
- Runtime E2E proves Studio cannot call admin/OCI endpoints and cannot read or mutate another studio's titles; authorized Super Admin sees the expected catalog.
- No production schema, credentials, role assignments, or deployment promotions are part of this change.

## Current disposition

HOLD for production. This document is an audit checkpoint, not a claim that all routes have been reviewed or that RBAC is certified.


## Follow-up route and database authorization review

### Code-level server boundaries inspected on the PR branch

- `src/lib/bridge/titles.ts`: title list/detail/transition handlers use a verified actor and title permission checks; Studio owner lists are scoped by `owner_user_id`, not organization display labels. Buyer lists are restricted to buyer-visible lifecycle states and the buyer-visibility predicate.
- `src/lib/bridge/assets.ts`: upload and download handlers assert permissions and resolve the title before signing; download additionally applies the asset-kind/owner/internal/license-entitlement decision. Buyer asset listings suppress private master/technical/censor-certificate entries and hide storage keys. Direct Studio-vs-Studio runtime requests are still required to certify behavior.
- `src/lib/bridge/profiles.ts`: onboarding requires a confirmed Supabase email; internal roles are sourced from a valid, unexpired, email-matched invite rather than the client-supplied account type. Role invitations require `users.invite_internal` plus `canGrantInternalRole`; tests assert ordinary admin cannot grant admin/super_admin.
- `src/lib/bridge/admin-workstations.ts`: the broad multi-table operational dataset is gated to verified Super Admin. Individual review and publication-gate actions use explicit permissions, but runtime negative tests are outstanding.
- `src/lib/bridge/delivery-traces.ts`: permission assertions run before the SQL client is acquired; non-internal reads are owner-scoped and buyer access is explicitly denied.
- `src/lib/bridge/streamvista.ts`: order reads and upload confirmation use owner predicates; handoff checks that the Bridge title owner matches the order owner.
- `src/lib/bridge/commercial-admin.ts`: rate/tax/settlement-rule writes require the dedicated `finance.configure` permission. Verify the intended role matrix for this permission before granting it to any role.

### Live RLS findings that remain blockers

These findings were observed in read-only queries against the canonical shared Supabase project. No policies or schema were changed.

1. `public.bridge_can_read_title(text)` is SECURITY DEFINER and treats every role recognized by `bridge_is_internal()` as able to read all titles. That currently includes viewer, QC reviewer, legal reviewer, finance, admin and super_admin. This is consistent with the current application `title.read_catalog` matrix but is a broad cross-tenant data boundary; retain only if the business-approved role matrix explicitly requires it.
2. `public.bridge_deals` RLS grants ALL operations to buyer-self and internal roles including `admin` and `legal_reviewer`. Application route permissions do not protect direct authenticated Supabase requests. Least-privilege policy alignment is required before certification.
3. `public.bridge_entitlements` SELECT permits own-user rows and admin/super_admin; `public.bridge_payments` SELECT permits own-user rows and finance/admin/super_admin. Confirm that buyer/creator ownership semantics match the application's entitlement and payment APIs.
4. `public.bridge_title_submission_intake` has RLS enabled but no listed client policy. Treat as server-only only after confirming all intended reads/writes use trusted server credentials and unauthenticated/authenticated client roles are denied.
5. The inspected Bridge/Loop tables had RLS enabled but `relforcerowsecurity=false`. This is not alone proof of exposure, but privileged table owners/service connections may bypass RLS; verify the actual application DB role and grants.
6. The current `bridge_can_read_title` helper and broad `bridge_deals` policy cannot be certified by app-level unit tests alone. A dedicated policy change/migration and direct-client negative tests would be required; those changes are intentionally outside this approved code-only branch scope.

### Current exact-head evidence and disposition

- Latest reviewed branch head before this follow-up: `12d6b9fcf6e797fa71e293f39ae8831a272e409f`.
- CI and Scope A PostgreSQL Onboarding Verification both passed on that exact head.
- Any follow-up commit changes the head; CI must be checked again for the new SHA.
- Vercel Preview SHA/runtime E2E are not verified. The previously reported Vercel connector request returned 403; no deployment was promoted or changed.
- OCI remains unresolved: prior upload attempt returned `401 NotAuthenticated`. Do not infer storage readiness from environment-variable presence or a successful build.
- Production remains HOLD. Do not merge, promote, change production settings, rotate credentials, mutate roles, or change Supabase policies/schema under this checkpoint.
