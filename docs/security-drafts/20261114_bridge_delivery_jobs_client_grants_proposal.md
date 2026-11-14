# Bridge delivery jobs — client-role grant correction proposal

Status: **PROPOSAL ONLY — NOT AN EXECUTABLE MIGRATION**

Base: 16d370ebe455045255868c556604a874cd1910af
Scope: public.bridge_delivery_jobs only.
Production posture: **HOLD / NOT CERTIFIED / NO-GO**.

## Evidence captured (read-only)

Production project mlmgugivsyoxzdgwkbpu:
- Table owner: postgres.
- RLS enabled; FORCE RLS disabled.
- Existing policy: bridge_delivery_jobs_internal_only, role authenticated, command ALL, both USING and WITH CHECK call private.bridge_is_internal().
- Direct grants reported for anon and authenticated: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
- service_role also has those privileges; this proposal does not change its grants pending a separate usage audit.
- Table FK: title_id -> bridge_titles(id) ON DELETE CASCADE.
- Current columns include requested_by and request_note.

Application code at this base:
- src/lib/bridge/delivery-jobs.ts exports authenticated TanStack server functions.
- listBridgeDeliveryJobs calls authMiddleware, requireVerifiedActor, then queries via getSql().
- Internal list is limited to admin / super_admin; creator/studio list is scoped by requester, title owner, or active studio membership.
- Create, assign, complete, and approve operations use authenticated server functions and role/permission checks.
- src/lib/db.ts uses a server-side PostgreSQL connection; database-binding.ts requires Preview to explicitly target STAGING and match the configured Supabase project.
- The reviewed application list path is not a browser PostgREST query. Actual deployed runtime DB role and every alternate access path still require confirmation.

## Proposed narrow correction (review before any migration)

```sql
-- Proposal only. Do not execute from this document.
REVOKE ALL PRIVILEGES ON TABLE public.bridge_delivery_jobs
  FROM PUBLIC, anon, authenticated;
```

Rationale:
- Browser-facing anon and authenticated roles should not directly read or mutate delivery-job rows.
- The existing direct authenticated policy does not make broad table grants appropriate for all authenticated users.
- The reviewed Bridge workflow is mediated by authenticated server functions and server-side SQL, where application RBAC and tenant/title scoping are enforced.
- Preserve service_role grants for now; removing them without auditing all service-role callers could break trusted workflows. Audit and narrow separately.

Do not add GRANT SELECT to authenticated merely to preserve the internal read route. That route uses the server-side database connection, not an authenticated PostgREST table read. Confirm the deployed connection role before rollout.

## Required validation before proposing an executable migration

1. In STAGING only, capture exact table ACL, RLS, policies, ownership, views, triggers, RPCs, and dependencies.
2. Identify all callers of bridge_delivery_jobs using Supabase REST/PostgREST, service-role clients, and direct SQL. Confirm the deployed DATABASE_URL role without exposing credentials.
3. Test server routes using dedicated STAGING identities:
   - anonymous: denied;
   - unrelated authenticated creator/studio: denied or no rows;
   - owner/requester: only scoped rows;
   - active studio member: only organization-owned title jobs;
   - internal admin/super_admin: only permitted operational access;
   - unauthorized internal role: denied;
   - assign/complete/approve: permission and state-transition checks.
4. Test direct PostgREST table access as anon and authenticated: denied after revoke.
5. Verify no UI/server function depends on direct authenticated table grants.
6. Run migration on STAGING only after explicit WRITE approval; capture before/after ACL and regression results.
7. Production change requires a separate explicit approval and separate release gate.

## Explicit non-actions

- No SQL executed by this proposal.
- No STAGING or PRODUCTION grants, policies, schema, or data changed.
- No Production deployment, merge, rollback, payment, or email action.
- No Vercel deployment retry.
- No Hostinger webhook activation or secret rotation.

**App-inu pani kittaruthu.**