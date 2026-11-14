-- PROPOSAL ONLY — NOT A SUPABASE MIGRATION
-- Do not execute in STAGING or PRODUCTION without explicit WRITE approval.
-- Target: public.bridge_delivery_jobs
-- Production project observed: mlmgugivsyoxzdgwkbpu
-- STAGING project observed: jbymleftneggcgutlcqu (table currently absent)
-- Expected current Production ACL for anon/authenticated: arwdDxt
-- Proposed result: no direct table privileges for anon/authenticated.
-- service_role and owner privileges are intentionally untouched.

-- PRE-FLIGHT: run separately as READ-ONLY before any execution.
SELECT
  to_regclass('public.bridge_delivery_jobs') AS target_table,
  (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.bridge_delivery_jobs')) AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = to_regclass('public.bridge_delivery_jobs')) AS force_rls,
  has_table_privilege('anon', 'public.bridge_delivery_jobs', 'SELECT') AS anon_select,
  has_table_privilege('authenticated', 'public.bridge_delivery_jobs', 'SELECT') AS authenticated_select,
  has_table_privilege('service_role', 'public.bridge_delivery_jobs', 'SELECT') AS service_role_select;

-- EXECUTION BLOCK — requires explicit approval and correct project confirmation.
-- This fails closed if the target table is absent.
DO $proposal$
BEGIN
  IF to_regclass('public.bridge_delivery_jobs') IS NULL THEN
    RAISE EXCEPTION 'bridge_delivery_jobs missing; refusing ACL change';
  END IF;
  REVOKE ALL PRIVILEGES ON TABLE public.bridge_delivery_jobs FROM PUBLIC, anon, authenticated;
END
$proposal$;

-- POST-FLIGHT: expect false for every anon/authenticated privilege below.
SELECT
  has_table_privilege('anon', 'public.bridge_delivery_jobs', 'SELECT') AS anon_select,
  has_table_privilege('anon', 'public.bridge_delivery_jobs', 'INSERT') AS anon_insert,
  has_table_privilege('anon', 'public.bridge_delivery_jobs', 'UPDATE') AS anon_update,
  has_table_privilege('anon', 'public.bridge_delivery_jobs', 'DELETE') AS anon_delete,
  has_table_privilege('anon', 'public.bridge_delivery_jobs', 'TRUNCATE') AS anon_truncate,
  has_table_privilege('authenticated', 'public.bridge_delivery_jobs', 'SELECT') AS authenticated_select,
  has_table_privilege('authenticated', 'public.bridge_delivery_jobs', 'INSERT') AS authenticated_insert,
  has_table_privilege('authenticated', 'public.bridge_delivery_jobs', 'UPDATE') AS authenticated_update,
  has_table_privilege('authenticated', 'public.bridge_delivery_jobs', 'DELETE') AS authenticated_delete,
  has_table_privilege('authenticated', 'public.bridge_delivery_jobs', 'TRUNCATE') AS authenticated_truncate,
  has_table_privilege('service_role', 'public.bridge_delivery_jobs', 'SELECT') AS service_role_select;

-- ROLLBACK ONLY IF REQUIRED AND SEPARATELY APPROVED.
-- Restores the observed table-level grants to anon/authenticated; review before use.
-- GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   ON TABLE public.bridge_delivery_jobs TO anon, authenticated;

-- IMPORTANT:
-- 1. REVOKE does not remove table ownership or bypass privileges held by owner/superuser.
-- 2. Recheck schema-level CREATE/USAGE, column grants, views, RPCs, inherited roles,
--    service_role callers, default privileges, and every PostgREST/server access path.
-- 3. Existing authenticated RLS policy remains in place; this proposal does not alter it.
-- 4. Run dedicated STAGING route/RBAC tests only after a safe staging fixture exists.
-- 5. No staging write is possible yet: bridge_delivery_jobs is absent from STAGING.