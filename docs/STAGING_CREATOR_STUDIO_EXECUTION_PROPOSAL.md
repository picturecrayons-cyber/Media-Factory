# STAGING Creator / Studio execution — migration provenance and ACL proposal

**Review status: DRAFT / NOT APPROVED TO APPLY**
**Target only:** Supabase STAGING / Testing project `jbymleftneggcgutlcqu` (ap-south-1).
**Explicitly excluded:** Production DB `mlmgugivsyoxzdgwkbpu`, Production Vercel deployment, all real users/payments/email/Loop publication.
**No DDL, DML, grants, policies, fixtures, Auth settings, or deployment changes were performed while preparing this document.**

## 1. Latest-head CI evidence

Documentation commit before this proposal: `4878a555497f9b433cbc9294b72b359cef80767b`.

- GitHub CI run `41549837218` (#1919): `gate` job completed SUCCESS. npm ci, build, Vercel output guard, TypeScript, ESLint, npm test, secret scan and legacy dump guard all completed successfully.
- The `workflow-postgres` job was still IN_PROGRESS at the time of inspection. Therefore latest-head full CI is **NOT YET PASS**.
- Scope A PostgreSQL Onboarding run `41549837217` (#959) completed SUCCESS against disposable CI PostgreSQL, not STAGING DB.
- This is code/CI evidence only, not application certification.

## 2. STAGING DB read-only findings (2026-11-03)

Project ref verified in the read-only query: `jbymleftneggcgutlcqu`.

- 32 public base tables; all 32 have RLS enabled.
- `pg_policies` has zero policies.
- 17 tables have direct `anon` and `authenticated` table grants. Each role has SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER privileges on those 17 tables.
- 1,576 direct column-grant rows; 10 sequence-grant rows.
- Six public default-ACL entries exist across owners `postgres` and `supabase_admin`. The snapshot includes browser-role table privileges (`arwdDxtm`), function EXECUTE (`X`) and sequence privileges (`rwU`).
- The inspected current public SECURITY DEFINER function set had no EXECUTE exposure for `anon` or `authenticated`.
- The MCP audit SQL session ran as `postgres`; this does **not** prove the Vercel application connection role.

The 17 tables with direct browser-role grants are:
`bridge_asset_versions`, `bridge_assets`, `bridge_audit_logs`, `bridge_buyer_interest`, `bridge_destination_packages`, `bridge_email_challenges`, `bridge_entitlements`, `bridge_invites`, `bridge_legal_cases`, `bridge_payments`, `bridge_profiles`, `bridge_qc_cases`, `bridge_rights_grants`, `bridge_story_concept_submissions`, `bridge_title_events`, `bridge_titles`, `bridge_webhook_events`.

## 3. Missing relation provenance — do not replay blindly

The STAGING DB currently lacks all six relations:
- `bridge_organizations`
- `bridge_organization_memberships`
- `bridge_loop_identity_links`
- `bridge_loop_publications`
- `bridge_title_investors`
- `loop_media_migration_queue`

Repository source review found:

| Relation | Source candidate | Dependency / risk | Current decision |
|---|---|---|---|
| `bridge_organizations`, `bridge_organization_memberships` | `migrations/0021_bridge_organizations.sql` | Additive schema; FKs to `bridge_profiles`; adds `organization_id` and `owner_organization_id`; no name-based backfill. | Candidate for isolated STAGING only after dependency and app DB role review. Not applied. |
| `bridge_loop_identity_links` | `migrations/0007a_identity_links.sql` | FK references `public."user"(id)`; read-only STAGING probe confirms `public.user` does not exist. `auth.users` exists. Applying as written will fail or require an independently approved identity-model redesign. | BLOCKED. Do not patch FK to another table by guess. |
| `bridge_loop_publications` | `migrations/0006_loop_canonical.sql` | File also creates Loop catalog tables and inserts/updates a title, publication marked `authorized`, and a Loop title marked `published=true`; includes a public sample playback URL. This is not a safe schema-only replay. | BLOCKED. Extract schema only into a separately reviewed, data-free STAGING migration after Loop owners approve the contract. Never replay this file wholesale. |
| `bridge_title_investors` | `migrations/0015_delivery_trace_finance.sql` | File also changes destination-package commercial columns and creates settlement tables/policies that depend on helpers from `0012_bridge_rls_identity_binding.sql`. It is not a table-only migration. | BLOCKED pending finance/rights model review and dependency decomposition. |
| `loop_media_migration_queue` | No canonical migration definition found in the inspected repository migrations. A test creates a local disposable table inline, but that is not migration provenance. | Need the owning Loop repo/schema contract, columns, retention, worker identity and lifecycle. | BLOCKED. Do not create a guessed placeholder table. |

The STAGING migration history lists 13 entries, all named `test_only_*` or `test_*`, ending with `testing_security_hardening_20261030`. It does not contain canonical migration identities `0006`, `0007a`, `0008`, `0012`, `0015` or `0021`. This history mismatch means source filenames cannot be assumed applied just because related test fixtures or SQL files exist.

Important code contract: `src/lib/db.ts` selects the server-side DB URL from `DATABASE_URL`, `POSTGRES_URL`, `SUPABASE_DB_URL` or `SUPABASE_DATABASE_URL`; it uses a server-side Postgres pool. The exact Vercel Preview binding and database login role have not been proven. `src/lib/bridge/session.ts` now loads a base profile without organization joins and fails closed with null organization scope when optional organization schema is absent.

## 4. ACL/RLS remediation proposal — review only

The current Bridge code describes a **server-authoritative DB access model**: application authorization runs in server functions and the browser must not directly query operational Bridge tables. If that remains the approved architecture, the safer boundary is least-privilege Data API revocation plus server-side RBAC tests, not broad `TO authenticated USING (true)` policies. RLS remains enabled as defense in depth.

This proposal must not be executed until all are confirmed:
1. Loop and Bridge owners confirm no browser client or external service depends on the 17 direct table grants.
2. Exact Vercel Preview branch deployment and its server-side DB ref/login role are proven to be STAGING.
3. Current ACLs are exported and rollback statements are peer-reviewed.
4. The role that owns/creates future objects is identified. Do not alter defaults for `supabase_admin` merely because that owner appears in the catalog.
5. All views, functions, sequences, column grants, storage policies and Data API usage are inventoried.

### 4.1 Read-only preflight SQL (safe to run)

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, column_name, grantee, privilege_type;

select object_name, grantee, privilege_type
from information_schema.usage_privileges
where object_schema = 'public'
  and object_type = 'SEQUENCE'
  and grantee in ('anon', 'authenticated')
order by object_name, grantee, privilege_type;

select d.defaclrole::regrole as object_owner,
       n.nspname as schema_name,
       d.defaclobjtype,
       d.defaclacl
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public'
order by 1, 3;

select p.oid::regprocedure as function_name,
       p.prosecdef,
       p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 1;

select current_user, current_role, session_user,
       to_regclass('public.user') as public_user_relation,
       to_regclass('auth.users') as auth_users_relation;
```

### 4.2 Candidate revocation statements (NON-EXECUTABLE draft)

The statements below are intentionally commented out. They are a candidate for a **separately approved STAGING-only change**, not instructions to run now. Validate browser and service dependencies first, capture a rollback ACL snapshot, and execute only in a maintenance window with the exact STAGING connection independently verified.

```sql
-- STAGING ONLY — DO NOT EXECUTE FROM THIS DOCUMENT.
-- Candidate only if Bridge + Loop owners confirm server-only DB access:
-- REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
-- REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
--
-- Column-level grants must also be enumerated and revoked explicitly where
-- they survive table-level revocation; generate exact per-column statements
-- from information_schema.column_privileges and review the generated diff.
--
-- Future defaults: apply only for the verified migration/object owner.
-- Example for postgres ONLY if proven to be the migration owner:
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   REVOKE ALL ON TABLES FROM anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   REVOKE ALL ON SEQUENCES FROM anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
--
-- Do not apply default-ACL changes to supabase_admin without proof it creates
-- application objects; do not revoke service_role or the server login role.
--
-- Do not add broad RLS policies. Do not disable RLS. Do not enable FORCE RLS
-- until the actual server DB role and bypass-RLS behavior are tested.
```

**Important:** This candidate is not yet a reviewed final migration. Table-level `REVOKE ALL` alone may not clear column-level grants. A full generated ACL diff, role dependency proof, exact rollback and reviewer sign-off are still required.

## 5. Canonical Bridge Preview status

Vercel project `bridge` was identified (Vite; team `stream-vista-opc-pvt-ltd-s-projects`). For branch `fix/creator-studio-rbac-scope-trailrun-20261103`:
- Branch-filtered Preview environment variable list returned zero entries.
- Branch-filtered deployment list returned zero deployments.
- No exact branch SHA → Preview deployment → STAGING DB ref chain is available.
- Project metadata showed a latest Production deployment; it was not changed or redeployed.

**Preview: NOT VERIFIED.** No deployment, environment variable, secret, or project setting was changed.

## 6. Execution gates

1. Wait for workflow run `41549837218` `workflow-postgres` job to complete; latest-head CI is not fully green yet.
2. Resolve identity schema mismatch (`public.user` absent) and isolate schema-only portions from data-bearing Loop migration `0006`.
3. Obtain the authoritative Loop migration contract for `loop_media_migration_queue`.
4. Confirm whether `0015` investor/settlement structures are in current product scope before decomposing them.
5. Complete ACL inventory including column grants and owner-specific defaults; prepare exact rollback and independent review.
6. Prove canonical Bridge Preview exact branch SHA and server-side STAGING DB ref/login role.
7. Only then run synthetic Creator A/B and Studio A/B tests inside an explicit rollback transaction.

**No STAGING DB migration, SQL write, Auth change, fixture write, Preview deployment, Production change, payment, email send or Loop publication has been performed.**

**Release decision: PRODUCTION — HOLD / NOT CERTIFIED / NO-GO.**
