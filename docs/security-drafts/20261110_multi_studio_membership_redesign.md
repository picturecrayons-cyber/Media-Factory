# Multi-Studio membership redesign — Draft only

Status: DESIGN / CODE-ONLY PROPOSAL — NOT INTEGRATED, NOT APPROVED FOR DATABASE APPLICATION.

## Confirmed source-level incompatibility

The current `migrations/0021_bridge_organizations.sql` creates a partial unique index on
`bridge_organization_memberships(user_id)` where status is active. It also stores a
single `bridge_profiles.organization_id`. The current session resolver joins through
that single profile organization and returns at most one organization. The RBAC
`Actor` contract currently exposes one optional `organizationId`.

This contradicts the required model: one Bridge user may have separately approved
memberships in multiple Studio organizations.

## Target authorization model

- `bridge_profiles.user_id` remains the Bridge identity.
- `bridge_organization_memberships` is the sole authority for Studio membership.
- Membership key remains (organization_id, user_id); multiple active rows per user
  are allowed, but only one row per user/organization.
- Membership role is scoped to its organization: owner/admin/member.
- Membership status and organization status must both be active for access.
- No organization name, email domain, legacy profile field, or title metadata may
  create or infer membership.
- Title access must use an explicit membership for the title's owner organization.
- A user with no active membership receives no Studio organization scope.
- Admin/internal staff permissions remain separate from account-type permissions.
- DIT access must be represented by explicit assignment/permission, not inferred
  from Studio membership or Admin/QC role.

## Compatibility / migration proposal — NOT FOR EXECUTION

1. Remove the one-active-organization-per-user partial unique index in a future,
   separately reviewed migration.
2. Retain the unique primary key (organization_id, user_id).
3. Stop treating bridge_profiles.organization_id as authorization authority.
   Keep it only as a legacy compatibility field during a reviewed transition;
   do not auto-backfill or infer memberships from it.
4. Resolve all active memberships for the authenticated Bridge user in the server
   session and expose a set of organization IDs, not a single ID.
5. Update title read/mutate queries and RBAC predicates to require the target
   owner_organization_id to be in that set.
6. Add an explicit DIT assignment model and tests before granting DIT capabilities.
7. Add table-specific RLS only after mapping server-only access paths, policies,
   SECURITY DEFINER functions, EXECUTE grants, and the actual Data API role model.

No SQL migration is included in this Draft proposal. No database has been changed.

## Regression coverage added

The accompanying pure helper tests verify:
- multiple active Studio memberships are preserved;
- memberships cannot be inherited from another Bridge user;
- invited/suspended/removed memberships and inactive organizations grant no scope;
- duplicate rows do not duplicate organization IDs;
- missing user or blank organization fails closed.

These tests exercise the scope-resolution primitive only. They do not yet prove
that all application queries use it; integration remains a separate gate.

## Access-control test matrix still required

- Creator: own title/assets only; cannot cross into another Creator or Studio.
- Studio: each separately approved active membership; no unapproved Studio access.
- Buyer: only explicit title/package entitlements, with expiry/revocation enforcement.
- Investor: reviewed access request and explicitly granted data scope only.
- Admin/super_admin: staff-role matrix; account type must not widen staff permissions.
- DIT: explicit production/title/asset assignment; no implicit Admin/QC equivalence.
- QC/Legal/Finance: only their explicit workflow permissions.
