-- Read-only Bridge database security inventory.
-- Safe to execute against a selected environment; this script performs SELECTs only.
-- It does not create, alter, grant, revoke, or modify data.
--
-- Run separately against STAGING and PRODUCTION and label the target explicitly.
-- Never treat an empty policy set as proof of safety: RLS-enabled tables with no
-- policies deny ordinary role access, but service-role / owner / BYPASSRLS paths
-- require separate review.

\echo '1. RLS state and policy count by public table'
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  count(p.policyname)::integer as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind in ('r','p')
group by n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relname;

\echo '2. Effective table grants for API roles'
select
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('PUBLIC','anon','authenticated','service_role')
order by table_name, grantee, privilege_type;

\echo '3. SECURITY DEFINER functions and execution grants'
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname, pg_get_function_identity_arguments(p.oid);

\echo '4. Event triggers that automatically change RLS state'
select
  evtname,
  evtevent,
  evtenabled,
  evttags,
  evfoid::regprocedure as handler
from pg_event_trigger
order by evtname;

\echo '5. Explicit policy definitions'
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
