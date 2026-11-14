-- PROPOSAL ONLY — NOT A SUPABASE MIGRATION
-- DO NOT EXECUTE in STAGING or PRODUCTION without separate explicit WRITE approval.
-- Target: public.bridge_delivery_jobs
-- PRODUCTION project observed: mlmgugivsyoxzdgwkbpu
-- STAGING project observed: jbymleftneggcgutlcqu (target table absent).
--
-- Evidence correction (2026-11-14):
-- Production raw ACL: postgres=arwdDxtm/postgres,
--   anon=arwdDxtm/postgres,
--   authenticated=arwdDxtm/postgres,
--   service_role=arwdDxtm/postgres.
-- arwdDxtm = SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN.
-- Previous proposal/rollback omitted MAINTAIN. This revision includes it.
-- Owner is postgres; RLS enabled; FORCE RLS false.
-- Existing policy bridge_delivery_jobs_internal_only applies to authenticated
-- and checks private.bridge_is_internal() for USING and WITH CHECK.
-- This proposal does not change ownership, RLS, policy, schema grants, or service_role.
--
-- IMPORTANT SCOPE:
-- 1. No canonical CREATE TABLE source was found in tracked migrations/ or
--    supabase/migrations/ at Production main SHA
--    16d370ebe455045255868c556604a874cd1910af. The only tracked migration
--    referencing this table is an ALTER TABLE adding requested_by/request_note
--    and an index. The Production catalog is the only currently verified schema source.
-- 2. No column-level ACL entries, non-internal triggers, or dependent views
--    were returned by the Production catalog queries. The title_id FK and
--    four table indexes were found.
-- 3. Default ACLs for postgres and supabase_admin include client-role defaults.
--    Those are owner/schema-specific and are NOT changed by this table-only proposal.
--    Do not add ALTER DEFAULT PRIVILEGES to this block.
-- 4. Vercel Preview branches reviewed do not currently have DATABASE_URL,
--    POSTGRES_URL, SUPABASE_DB_URL, or SUPABASE_DATABASE_URL in branch-scoped
--    env metadata. Therefore the actual Preview DB runtime role is NOT VERIFIED.
-- 5. STAGING has no public.bridge_delivery_jobs table. Do not create it just
--    to exercise this proposal.
--
-- READ-ONLY PRE-FLIGHT (run separately, after selecting and confirming target project):
SELECT
  current_database() AS database_name,
  current_user AS connected_role,
  session_user AS session_role,
  to_regclass('public.bridge_delivery_jobs') AS target_table,
  (SELECT relowner::regrole::text FROM pg_class WHERE oid = to_regclass('public.bridge_delivery_jobs')) AS table_owner,
  (SELECT relacl::text FROM pg_class WHERE oid = to_regclass('public.bridge_delivery_jobs')) AS raw_acl,
  (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.bridge_delivery_jobs')) AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = to_regclass('public.bridge_delivery_jobs')) AS force_rls;

-- Effective privilege snapshot. Include all PostgreSQL 17 table privileges.
SELECT
  role_name,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'SELECT') AS can_select,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'INSERT') AS can_insert,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'UPDATE') AS can_update,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'DELETE') AS can_delete,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'TRUNCATE') AS can_truncate,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'REFERENCES') AS can_references,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'TRIGGER') AS can_trigger,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'MAINTAIN') AS can_maintain
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
WHERE to_regclass('public.bridge_delivery_jobs') IS NOT NULL;

-- Inspect inherited role memberships before interpreting effective privileges.
SELECT
  member.rolname AS member_role,
  granted.rolname AS inherited_role
FROM pg_auth_members m
JOIN pg_roles member ON member.oid = m.member
JOIN pg_roles granted ON granted.oid = m.roleid
WHERE member.rolname IN ('anon','authenticated','service_role','authenticator')
   OR granted.rolname IN ('anon','authenticated','service_role','authenticator')
ORDER BY 1, 2;

-- Inspect owner-specific default ACLs; this is an audit query, not remediation.
SELECT
  d.defaclrole::regrole::text AS object_owner,
  COALESCE(d.defaclnamespace::regnamespace::text, '<all schemas>') AS schema_scope,
  d.defaclobjtype AS object_type_code,
  x.grantee::regrole::text AS grantee,
  x.privilege_type,
  x.is_grantable
FROM pg_default_acl d
CROSS JOIN LATERAL aclexplode(d.defaclacl) x
WHERE x.grantee IN ('anon'::regrole, 'authenticated'::regrole)
ORDER BY 1, 2, 3, 4, 5;

-- PROPOSED EXECUTION BLOCK — ONLY after all preflight/dependency/runtime checks
-- pass AND a separate explicit WRITE approval names the target project.
-- This fails closed if the table is absent.
DO $proposal$
BEGIN
  IF to_regclass('public.bridge_delivery_jobs') IS NULL THEN
    RAISE EXCEPTION 'bridge_delivery_jobs missing; refusing ACL change';
  END IF;
  REVOKE ALL PRIVILEGES ON TABLE public.bridge_delivery_jobs
    FROM PUBLIC, anon, authenticated;
END
$proposal$;

-- POST-FLIGHT: expect FALSE for every anon/authenticated privilege below.
-- service_role values should remain exactly as captured in preflight.
SELECT
  role_name,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'SELECT') AS can_select,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'INSERT') AS can_insert,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'UPDATE') AS can_update,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'DELETE') AS can_delete,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'TRUNCATE') AS can_truncate,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'REFERENCES') AS can_references,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'TRIGGER') AS can_trigger,
  has_table_privilege(role_name, 'public.bridge_delivery_jobs', 'MAINTAIN') AS can_maintain
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name);

-- ROLLBACK — ONLY if separately approved after reviewing the security impact.
-- This intentionally restores the previously observed HIGH-RISK direct client ACL.
-- It restores the eight observed table privileges, including PostgreSQL 17 MAINTAIN.
-- No PUBLIC grant was present in the captured raw relacl, so do not add one.
-- GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--   ON TABLE public.bridge_delivery_jobs TO anon, authenticated;

-- DEFAULT PRIVILEGE DECISION:
-- No ALTER DEFAULT PRIVILEGES statement is included here. The Production audit
-- found anon/authenticated defaults on tables, sequences, and functions for
-- postgres (public/storage) and supabase_admin (public/graphql/graphql_public).
-- These affect future objects created by each owner, across different services.
-- They require a separate owner-by-owner and schema-by-schema change proposal.
-- In particular, do not alter supabase_admin defaults or managed graphql/storage
-- defaults as part of this table correction.
--
-- ACCEPTANCE REQUIREMENTS before any WRITE:
-- - prove the actual Vercel Preview connection role; connector SQL session_user
--   = postgres is NOT evidence of the application runtime role.
-- - prove all server-side callers use a least-privileged trusted DB role and
--   never depend on browser direct table grants.
-- - review schema USAGE/CREATE, column ACL, views, RPCs, role inheritance,
--   default ACLs, PostgREST paths, service_role callers, and audit dependencies.
-- - test the correction and rollback only against an isolated disposable
--   schema/database with synthetic identities; current STAGING lacks the table.
-- - retain the existing RLS policy until a separate policy review approves change.
