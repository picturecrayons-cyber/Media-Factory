# Scope A harness correction and privilege/default-ACL verification — 2026-10-31

**Status:** Draft verification record; no Staging or Production mutation.
**PR:** #439
**Production:** HOLD / NOT CERTIFIED / NO-GO.

## 1. Scope A harness correction

The previous Scope A script printed `migration_replay: passed` without checking the migration ledger. It also inserted into `auth.users` and `bridge_profiles` but did not seed the actual referenced Better Auth `public."user"` row, even though checked-in migration `migrations/0007a_identity_links.sql` defines:

- `bridge_user_id -> public."user"(id)`
- `auth_user_id -> auth.users(id)`

The earlier script's comment suggesting that the Bridge-side identity link resolves through `bridge_profiles(user_id)` was therefore inaccurate. This correction tests the checked-in migration contract as it exists today; it does not approve changing the FK target. The mismatch with the current Supabase Auth runtime remains an owner decision and must be reconciled separately.

### Corrected disposable workflow

The existing `.github/workflows/scope-a-postgres.yml` already provisions a job-local PostgreSQL 17 service. The corrected workflow:

1. Uses only the local `127.0.0.1:5432/bridge_scope_a` service.
2. Requires an explicit disposable-database flag and a strict local-host/database-name guard in the harness.
3. Replays repository migrations only into that disposable service.
4. Checks the migration ledger for `0001_auth.sql`, `0004_bridge.sql`, and `0007a_identity_links.sql`.
5. Checks that the live test schema has both identity foreign-key targets.
6. Runs actual inserts for the two identity authorities, the Bridge profile, and the identity link.
7. Tests duplicate-email rejection and orphan-FK rejection.
8. Rolls back the complete test transaction and verifies all row counts return to their baseline.

No Supabase URL, Staging credential, Production credential, or Vercel database variable is used by this workflow.

### Expected evidence — not yet run

The script emits `result: PASS` only after every assertion succeeds. A GitHub Actions job that has not run this exact script is **NOT RUN**, even if the general CI or workflow PostgreSQL job passes.

The migration replay includes repository migration files in the disposable CI database only. Any seed or publication side effects from those migrations are confined to the throwaway job service and do not touch a live project.

## 2. Fresh read-only STAGING DB privilege observations

Target: Supabase Staging project `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB). Queries were catalog/privilege SELECTs only.

- 32 public base tables were present; no public `loop_*` tables were present.
- `bridge_profiles`, `bridge_invites`, `bridge_payments`, `bridge_webhook_events`, and `bridge_entitlements` all had RLS enabled, but no row in `pg_policies` was returned for those five tables.
- For those five tables, the direct grants to both `anon` and `authenticated` included SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER.
- The earlier 32-table audit recorded 17 tables with broad browser-role table ACLs. The remaining objects still require complete per-object ACL verification; absence from the earlier 17-object result is not a security certification.
- Five public sequences were previously enumerated; each had USAGE, SELECT, and UPDATE effective for both browser roles.
- The current public-schema default ACL query returned broad defaults for both `postgres` and `supabase_admin`:
  - table defaults include browser-role DML and other table privileges;
  - sequence defaults include USAGE/SELECT/UPDATE;
  - function defaults include EXECUTE.
- One SECURITY DEFINER function, `bridge_duplicate_title_loop_release_allowed`, was found in the current Staging public function inventory with EXECUTE limited to `postgres` and `service_role`.

**Interpretation:** RLS enabled without policies does not offset broad SQL grants. Direct ACLs, sequence ACLs, and default ACLs are distinct surfaces and need separate verification.

## 3. Default-ACL repair proposal — STAGING only, not executable

Proposed design for a later separately approved change:

1. Capture raw `pg_default_acl` entries, owner, schema, object type, grantor, and global/default scope.
2. Confirm with authoritative Supabase audit/support evidence whether the `postgres / public` defaults were installed as project-managed defaults and confirm `postgres` is the intended migration owner.
3. If and only if both conditions are proven, prepare a separate migration draft limited to `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` for `anon` and `authenticated` on tables, sequences, and functions.
4. Do not alter defaults owned by `supabase_admin`, `supabase_auth_admin`, or platform schemas. Catalog output does not establish operator provenance or authorize changing platform-managed defaults.
5. Separately inventory any global defaults and PUBLIC grants; a schema-scoped default-privilege change must not be assumed to cancel global grants.
6. Verify with a disposable schema/project test before any canonical Staging application is considered.

The proposed statements, if later approved, would be equivalent in scope to:

```sql
-- STAGING DB only; NOT APPROVED; do not execute from this document.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
```

These are design examples only. They do not repair existing objects, do not remove privileges granted through PUBLIC or inherited roles, and must not be run until provenance and complete ACL preflight are proven.

## 4. PRODUCTION DB observation and boundary

A separate catalog-only check against Production project `mlmgugivsyoxzdgwkbpu` found the same broad public-schema default ACL pattern for `postgres` and `supabase_admin`. Selected existing Bridge/Loop table ACLs and policies differed from Staging, but that does not certify the entire Production security posture.

**No Production repair is proposed here.** Do not run GRANT, REVOKE, ALTER DEFAULT PRIVILEGES, DDL, DML, migration, RLS, policy, identity, or deployment actions in Production.

## 5. Release and execution gates

- Scope A: **NOT RUN until the corrected dedicated workflow reports the exact script step successful**.
- Identity FK design: **OWNER DECISION REQUIRED**; current migration references Better Auth `public."user"`, while current runtime uses Supabase Auth and Bridge profile mapping.
- Staging ACL repair: **DRAFT ONLY**; complete object/column/sequence/function/view/role-inheritance and default-ACL provenance inventory required.
- Staging DB: no changes made.
- Production DB: no changes made; **HOLD / NOT CERTIFIED / NO-GO**.
- PR #439 remains Draft and must not be merged as part of this work.
