# Bridge STAGING — Multi-Studio RBAC Draft Redesign & Privileged Function Review

**Status:** DRAFT PROPOSAL — NOT APPROVED FOR DATABASE APPLICATION  
**Repository:** `picturecrayons-cyber/Media-Factory`  
**Branch:** `chore/staging-readonly-schema-audit-20261110`  
**STAGING DB:** `jbymleftneggcgutlcqu` — Crayons Projects - Testing DB  
**PRODUCTION DB:** Out of scope — HOLD / NOT CERTIFIED / NO-GO  
**Action:** READ-ONLY database inspection + code-only test repair + documentation proposal  
**Access:** STAGING READ-ONLY; GitHub Draft-branch WRITE only  
**Risk:** No DB writes, migrations, grants, policies, data changes, merge, deployment, Preview promotion, or Production operation.

## 1. Migration-history reconciliation — evidence and unresolved parity

The STAGING migration history contains 31 rows. Exact versions/names were read from `supabase_migrations.schema_migrations`.

Findings that prevent declaring source-to-database parity PASS:

1. The applied history contains two distinct versions with the same name `20261106_story_concept_buyer_mandates`:
   - `20261106083617`
   - `20261106084908`
   This needs explanation (intentional repeat, duplicate application, or naming collision) from the actual migration source files.
2. The checked-in branch file `migrations/0021_bridge_organizations.sql` is not represented by an applied history row named `0021_bridge_organizations`. Do not assume the file is applied because the tables exist.
3. The checked-in `0021_bridge_organizations.sql` defines membership with composite primary key `(organization_id,user_id)`, and does not define an `id` column. STAGING catalog instead reports `bridge_organization_memberships.id` as NOT NULL and the primary key index on `id`, plus a separate unique index on `(organization_id,user_id)`. This is schema drift relative to the fetched migration file.
4. The fetched migration defines a partial unique index `bridge_organization_memberships_one_active_org_per_user` (one active organization per user). STAGING's current `pg_indexes` result did not show that index. The database therefore does not match this file on that constraint either.
5. The source migration inventory for all repository migration files could not be enumerated through the available GitHub file interface in this session. Therefore the complete 31-row version/name/file/hash reconciliation remains **BLOCKED / NOT VERIFIED**. Do not label the migration audit complete.

Required follow-up to close this gate: obtain a complete migration directory listing and file contents at this exact branch HEAD; map every applied row to exactly one source file; compare checksums/content where possible; list unapplied source files, duplicate names, missing files, and schema drift. Never repair history by editing `schema_migrations` manually.

## 2. Multi-Studio architecture — code-only proposal

### Existing source behavior

- `Actor` already has `organizationId?` and `organizationIds?`.
- `session.ts` loads all active memberships joined to active organizations, stores all IDs in `organizationIds`, and sets the legacy singular `organizationId` only when there is exactly one membership.
- `rbac.ts` uses `organizationIds` (with a legacy singular fallback) to test whether a Studio member shares the title's exact `ownerOrganizationId`.
- `organization-scope.ts` returns sorted, unique active organization IDs for the exact Bridge user and rejects invited, suspended, removed, inactive, blank, or foreign-user membership rows.
- Existing `organization-scope.test.ts` and `rbac.test.ts` already cover multiple memberships, exact organization isolation, inactive membership denial, and cross-organization title access.

### Database mismatch to resolve in a separate migration proposal

The fetched `migrations/0021_bridge_organizations.sql` currently includes the one-active-organization partial unique index. That constraint must not exist in the final multi-Studio model. However, STAGING catalog evidence does not show that index, and STAGING has a different membership primary-key shape. Do not create a drop-index migration until source/history parity and the actual index inventory are reconciled.

Proposed target invariants (design only):

- Membership is the authoritative many-to-many relation: one Bridge user may hold memberships in multiple organizations.
- Preserve a unique membership identity per `(organization_id,user_id)`; the current STAGING surrogate `id` may remain only if the composite unique constraint is retained and source history explains it.
- Active membership requires explicit approval by an authorized organization owner/admin or internal operator. Record approver identity/time and the approval/revocation event; do not infer approval from signup, email domain, profile organization name, or a client-supplied organization ID.
- Membership status transitions are fail-closed: `invited → active` only through an authorized approval path; `suspended` / `removed` revoke access immediately.
- Every request selects one explicit organization context from the user's verified active membership set. No arbitrary first membership, fallback by organization name, or union of all Studio title data into one unscoped workspace.
- Title read/mutation must compare the selected organization context with `bridge_titles.owner_organization_id`; ownership by the same user remains a distinct owner path.
- Internal staff permissions remain separate from account-type permissions. A staff role must not inherit Creator/Studio powers.
- Keep `bridge_profiles.organization_id` only as a deprecated compatibility field during a separately planned transition; it must not be the authority for multi-Studio authorization.

### Request-context contract

1. Authenticate the user and resolve the canonical Bridge user ID server-side.
2. Load active memberships and active organizations for that Bridge user.
3. If exactly one membership exists, a compatibility default may be supplied to old UI routes, but authorization still uses the explicit selected organization ID.
4. If multiple memberships exist, require an explicit selected organization ID and verify it belongs to the active membership set.
5. On missing, stale, suspended, removed, or foreign organization context, deny access.
6. Re-check membership status on every sensitive server operation; do not trust a stale client session selection as authorization.

## 3. Regression-test coverage

The package test script already includes:
- `src/lib/bridge/organization-scope.test.ts`
- `src/lib/bridge/session-schema-regression.test.ts`
- `src/lib/bridge/rbac.test.ts`
- `src/lib/bridge/dit-assignment.test.ts`

Existing tests cover Creator/Studio owner boundaries, Buyer catalog restrictions, Investor workspace routing, staff-role separation, multi-Studio membership IDs, cross-Studio denial, inactive membership denial, and exact DIT assignment scope.

### Test defect repaired in this branch

The DIT test file contained literal backslash-n sequences in the middle of a test declaration, making that section invalid TypeScript source. The test was rewritten as normal source lines while preserving the intended assertion:

- An asset-scoped DIT assignment must not authorize a broader title-level request.
- Exact user + production + title + asset matching remains mandatory.
- Pending, suspended, and revoked assignments fail closed.

This is a test-source repair only. The test has **not** been executed in this session; CI must validate the new commit SHA.

### Additional required tests before any DB policy proposal

- Two active memberships: selecting Studio A allows only A; selecting Studio B allows only B.
- Missing or unselected context when multiple memberships exist denies all Studio-scoped reads and writes.
- Membership suspended/revoked between session creation and mutation denies the mutation.
- A Studio owner/admin may approve only memberships within their own organization; cannot approve another Studio.
- Creator-owned title cannot be accessed by a Studio solely because of matching organization name or email domain.
- Buyer access requires exact unexpired, non-revoked title access; expired/revoked access denies.
- Investor access is limited to explicitly granted investment entitlements; no title/asset/finance access by account type alone.
- Admin, QC, Legal, Finance permissions remain distinct; no staff account inherits Creator/Studio owner mutations.
- DIT requires an active exact assignment; Admin/QC/Creator/Studio status alone grants no DIT asset access.
- Rights evidence submitter cannot approve their own evidence; Legal self-review remains denied.
- Cross-Studio title mutation and signed asset download both deny when context differs.

## 4. DIT / Creator / Studio / Buyer / Investor / Admin

The code currently has a separate DIT assignment helper and test, but DIT is not an explicit `InternalRole` in `rbac.ts`. Do not add DIT to the generic staff role map without a reviewed capability model. The safer target is a distinct assignment capability checked for the exact production/title/asset, with audited assignment and revocation operations.

Creator and Studio share the account-level owner permission set in `rbac.ts`; Studio collaboration is only valid through the exact organization membership and title organization match. Buyer and Investor permissions are narrower and must not inherit creator/staff capabilities. Admin and super-admin remain distinct; sensitive operations must use explicit permissions, not dashboard visibility.

## 5. `bridge_private` SECURITY DEFINER review — STAGING READ-ONLY

Catalog inspection found 8 SECURITY DEFINER functions in the inspected schemas:
- `bridge_private`: 7 functions
- `public`: 1 function

### `bridge_private` functions

All 7 are owned by `postgres`, use fixed `search_path = pg_catalog, public`, and have EXECUTE granted to `authenticated` and owner `postgres` only (no `anon` or `PUBLIC` ACL observed):

- `current_user_id()`
- `current_internal_role()`
- `is_admin()`
- `is_staff()`
- `can_manage_title(text)`
- `can_read_title(text)`
- `can_read_workspace_title(text)`

The fixed search path and schema-qualified table references are positive controls. However, these functions are callable by every authenticated database role and must be treated as exposed authorization helpers, not private server-only functions.

Review findings / follow-up:
- `current_user_id()` derives identity from `auth.uid()` through `bridge_loop_identity_links` or direct profile ID match. Validate identity-link uniqueness and ensure null/unlinked users fail closed.
- `can_manage_title(text)` checks `is_admin()`, same-user ownership, or an active Studio membership matching `owner_organization_id`. It does not currently check organization status in the membership subquery, nor an explicit approval actor/time field. The session query does join active organizations; the SQL helper should not have a weaker membership predicate.
- `is_admin()` checks only `internal_role = 'admin'`; it does not include `super_admin`. Confirm this is intentional for every caller and policy before changing it.
- `is_staff()` includes admin, QC, Legal, Finance, and viewer, but not super_admin. Confirm intended staff coverage for all policy callers.
- `can_read_title(text)` permits a buyer only when a matching unrevoked, unexpired `bridge_buyer_title_access` row exists and title visibility passes. Verify indexes and revoke/expiry boundary tests.
- `can_read_workspace_title(text)` is a direct composition of manage-title or staff checks. Confirm no caller interprets it as a mutation permission.

### `public.bridge_duplicate_title_loop_release_allowed(text)`

- SECURITY DEFINER, owner `postgres`, fixed `search_path = public, pg_temp`.
- EXECUTE ACL observed only for `service_role` and owner `postgres`; no `anon`, `authenticated`, or `PUBLIC` grant observed.
- It checks duplicate-title review status. Keep it server-only; inspect every call site and ensure the service-role invocation is itself behind authenticated, authorized Bridge workflow logic.

No function definitions, ownership, ACLs, or policies were modified.

## 6. RLS proposal gate

Do not draft blanket policies. Before a table-specific policy proposal:
1. Finish migration file/history/checksum reconciliation.
2. Resolve membership schema drift and approve the multi-Studio request-context design.
3. Confirm the actual Bridge runtime DB role and whether it bypasses RLS; distinguish it from Supabase `anon` / `authenticated`.
4. Review all SECURITY DEFINER call sites, owners, fixed search paths, EXECUTE grants, and result semantics.
5. Produce a per-table actor × operation matrix with Creator, Studio, Buyer, Investor, Admin, QC, Legal, Finance, and DIT.
6. Decide which tables remain server-only (current data API lockdown is intentional) and which, if any, require browser Data API access.
7. Add positive and negative tests before proposing any grants or policies.

## 7. Explicit non-actions and release status

- **STAGING DB:** Action READ-ONLY; Access READ-ONLY; Risk no database mutation. No migration, policy, grant, or data write.
- **PRODUCTION DB:** Action NO ACTION; Access HOLD; Risk no production change. **HOLD / NOT CERTIFIED / NO-GO.**
- No merge, deployment, Preview promotion, customer email, or live payment operation.
- No paid service or infrastructure change; cost ₹0.

**Migration parity:** BLOCKED / NOT VERIFIED.  
**Multi-Studio source logic:** Existing helpers/tests present; schema-history mismatch BLOCKED.  
**DIT test source repair:** Committed; execution NOT VERIFIED.  
**SECURITY DEFINER / EXECUTE inventory:** READ-ONLY review completed; semantic sign-off NOT VERIFIED.  
**RLS policy proposal:** Deliberately deferred until all preceding gates pass.

App-inu pani kittaruthu.
