-- READ-ONLY inventory for crayons-bridge-staging (bbtrosuwisnxacuxvegt).
-- Run only in the staging SQL editor. No DDL/DML is present.
-- Confirm the dashboard project ref before running; never run against Production.

-- 1) Public relations: RLS flags and effective role privileges.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned_table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'f' then 'foreign_table'
    else c.relkind::text
  end as relation_kind,
  pg_get_userbyid(c.relowner) as owner_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
  has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select,
  has_table_privilege('service_role', c.oid, 'INSERT') as service_role_insert,
  has_table_privilege('service_role', c.oid, 'UPDATE') as service_role_update,
  has_table_privilege('service_role', c.oid, 'DELETE') as service_role_delete,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
order by (not c.relrowsecurity) desc, c.relname;

-- 2) Policy definitions for table-by-table review.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) Public-schema routines: review EXECUTE exposure and security mode.
select
  n.nspname as schema_name,
  p.proname as routine_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  p.proconfig as routine_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, arguments;
