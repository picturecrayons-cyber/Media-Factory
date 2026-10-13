# Staging-only Supabase RLS remediation plan

**Status: preparation only — no SQL remediation applied.**  
**Target:** staging project `bbtrosuwisnxacuxvegt` only.  
**Never target:** canonical Production project `mlmgugivsyoxzdgwkbpu`.

## Release gate
Keep release HOLD until all gates pass against the same application commit and matching Vercel Preview deployment. Project health or green build alone is not certification.

## Configuration blocker to resolve first
The inspected `src/lib/bridge/canonical.ts` rejects every Supabase project ref other than Production. A branch-scoped staging URL can therefore exist in Vercel while the application rejects or rewrites it at runtime. Do not weaken the production guard globally. Add a narrowly scoped, test-covered Preview-only staging allowlist (explicit staging ref, explicit Preview environment, fail closed in Production), then verify the deployed runtime resolves to `bbtrosuwisnxacuxvegt`.

The app's `src/lib/db.ts` requires a server-side Postgres connection on Vercel; client Supabase variables are not a substitute for `DATABASE_URL` / `POSTGRES_URL`. Bind only the staging database URL to the audit Preview branch, do not print/decrypt its value, and preserve `BRIDGE_E2E_ALLOW_DB_MUTATION=NO` until the isolated E2E runner is explicitly provisioned.

## Table-by-table inventory and decision matrix
Run `scripts/sql/staging-rls-grants-audit.sql` against staging. For every relation record:
- Relation kind and owner; RLS enabled/forced state.
- Effective `anon`, `authenticated`, and `service_role` SELECT/INSERT/UPDATE/DELETE privileges.
- Policies: roles, command, `USING`, and `WITH CHECK`.
- Intended browser, signed-in user, tenant/Studio, or server-only access class.
- Owning route/service and tests proving the access path.

Do not infer intent from table names. Each relation needs an explicit owner decision before policy/grant changes.

| Access class | Default target | Required proof |
|---|---|---|
| Public/browser-readable | `anon` SELECT only where intentional; RLS enabled | Reviewed safe rows/columns; anonymous write denial |
| Signed-in user data | `authenticated` with ownership/tenant predicates | Two-user isolation; UPDATE has both `USING` and `WITH CHECK` |
| Studio/tenant data | `authenticated` plus verified Studio membership/role | Studio A cannot read/write Studio B fixtures |
| Server-only operational data | No browser `anon` or `authenticated` access unless explicitly required | Server route authorization; privileged key remains server-only |
| Payment, rights, audit, entitlement, publication, submission | Sensitive/server-only until narrower access is documented | Anonymous denial; server authorization and audit integrity |

This is a review baseline, not a blanket GRANT/REVOKE script.

## Safe execution sequence
1. Capture current inventory and grants/policies (never export connection strings or secrets).
2. Verify Preview's resolved Supabase ref and server DB host without logging credentials. Target must be staging.
3. Complete the per-table decision matrix, including views, functions, sequences, and Storage policies.
4. Draft an explicit-relation staging-only migration; no automatic blanket loops.
5. Review diff and rollback. No Production project ID/URL or Production environment target in the migration path.
6. Apply only after review to staging; rerun Supabase advisors and inventory.
7. Run negative tests before positive tests:
   - anonymous SELECT/INSERT/UPDATE/DELETE against sensitive fixtures denied;
   - User A cannot read/mutate User B rows;
   - Studio A cannot read/mutate Studio B;
   - non-buyer cannot access buyer-only records;
   - revoked/unpublished title cannot be read via Loop delivery;
   - service-only routes reject missing/invalid authorization;
   - UPDATE cannot change ownership/tenant columns.
8. Test login, session persistence, logout, recovery and refresh with isolated accounts.
9. Certify only when exact-head CI, matching Preview SHA, runtime target proof, all allow/deny tests, and advisor results pass.

## Stop conditions
Keep HOLD if staging ref differs, server credentials are missing, any secret appears in logs, a negative test unexpectedly succeeds, behavior differs from the reviewed matrix, the app falls back to local PGlite, Vercel environment classification is ambiguous, or any test could reach Production.

## Change boundary
Staging-only. No Production migration, grant/policy update, credential rotation, merge, promotion, payment, email send, or release is authorized by this plan. Production remains untouched.
