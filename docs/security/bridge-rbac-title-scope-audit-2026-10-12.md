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
