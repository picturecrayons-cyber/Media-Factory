# Staging-only Supabase RLS remediation plan

**Status: preparation only — no SQL remediation applied.**  
**Target:** staging project `bbtrosuwisnxacuxvegt` only.  
**Never target:** canonical Production project `mlmgugivsyoxzdgwkbpu`.

## Release gate

Keep release HOLD until all gates below pass against the same application commit and matching Vercel Preview deployment. A healthy Supabase project or a green build alone is not certification.

## Important configuration conflict to resolve first

The inspected `src/lib/bridge/canonical.ts` currently rejects every Supabase project ref other than the canonical Production ref. That means a branch-scoped staging URL can be present in Vercel while the application still rejects or rewrites it at runtime. Do not weaken the production guard globally. Add a narrowly scoped, test-covered Preview-only staging allowlist (explicit project ref, explicit Preview environment, fail closed in Production), then verify the deployed runtime resolves to `bbtrosuwisnxacuxvegt`.

The app's `src/lib/db.ts` also requires a server-side Postgres connection on Vercel; client Supabase variables are not a substitute for `DATABASE_URL` / `POSTGRES_URL`. Bind only the staging database URL to the audit Preview branch, do not print or decrypt its value, and preserve `BRIDGE_E2E_ALLOW_DB_MUTATION=NO` until the isolated E2E runner is explicitly provisioned.

## Required inventory and decision matrix

Run the read-only SQL in `scripts/sql/staging-rls-grants-audit.sql` against staging. For every relation, record:

- Relation kind and owner.
- RLS enabled/forced state.
- Effective `anon`, `authenticated`, and `service_role` SELECT/INSERT/UPDATE/DELETE privileges.
- All policies: roles, command, `USING`, and `WITH CHECK`.
- Whether the relation is intended for browser access, authenticated user access, or server-only access.
- Owning route/service and tests proving the intended access path.

Do not infer intended access solely from table names. For each table, an owner must explicitly classify it before a policy or grant is changed.

| Access class | Default target | Required proof |
|---|---|---|
| Public/browser-readable | `anon` SELECT only where intentional; RLS enabled | Explicitly reviewed safe rows/columns and anonymous negative write tests |
| Signed-in user data | `authenticated` with ownership/tenant predicates | Two-user isolation tests; UPDATE includes both `USING` and `WITH CHECK` |
| Studio/tenant data | `authenticated` plus verified Studio membership/role predicates | Studio A cannot read/write Studio B fixtures |
| Server-only operational data | No `anon` or browser `authenticated` table access unless explicitly required | Server route authorization tests; privileged key stays server-side |
| Payment, rights, audit, entitlement, publication, submission data | Treat as sensitive/server-only until owner documents a narrower need | Deny anonymous access; prove server authorization and immutable audit behavior |

This table is a review baseline, not a blanket GRANT/REVOKE script.

## Safe execution sequence

1. Capture the current inventory and export the current grants/policies to the PR evidence (redact connection strings and all secret values).
2. Confirm Preview's resolved Supabase project ref and server database host without logging credentials. The project must be staging.
3. Write a per-table approved decision matrix, including any views, functions, sequences, and Storage policies used by the app.
4. Draft a staging-only migration; use explicit relation lists and explicit policies. Never use an automatic loop to enable RLS/revoke grants across all tables.
5. Review the diff and rollback procedure. No Production project ID, Production DB URL, or production environment target may appear in the migration execution path.
6. Apply only after review to staging. Immediately re-run Supabase security advisors and the read-only inventory.
7. Run negative tests before positive tests:
   - unauthenticated SELECT/INSERT/UPDATE/DELETE against sensitive fixtures are denied;
   - User A cannot read or mutate User B rows;
   - Studio A cannot read or mutate Studio B records;
   - a non-buyer cannot access buyer-only records;
   - a revoked/unpublished title cannot be read through Loop delivery paths;
   - service-only routes reject missing/invalid authorization;
   - UPDATE cannot change ownership/tenant columns.
8. Run login, session persistence, logout, password recovery, and refresh tests using isolated test accounts.
9. Certify only when CI, the matching Preview SHA, runtime backend-target proof, all allow/deny tests, and advisor results pass.

## Stop conditions

Stop and keep HOLD if the staging ref differs, server credentials are missing, any secret value appears in logs, a negative test unexpectedly succeeds, RLS/policy behavior differs from the reviewed matrix, the app falls back to local PGlite, the Vercel deployment target is ambiguous, or a test could reach Production.

## Change boundary

This PR must remain staging-only. No Production migration, grant/policy update, credential rotation, merge, promotion, payment, email send, or release is authorized by this plan. Production is untouched.
