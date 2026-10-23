-- Read-only assertions for the first Staging RLS review gate.
-- Target: crayons-bridge-staging (bbtrosuwisnxacuxvegt) ONLY.
-- No DDL/DML. This script reports conditions; it does not change them.

select
  'loop_watchlist' as object_name,
  c.relrowsecurity as rls_enabled,
  coalesce(p.policy_count, 0) as policy_count,
  coalesce(g.client_grants, '') as anon_authenticated_grants,
  coalesce(g.service_role_grants, '') as service_role_grants
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join (
  select tablename, count(*) as policy_count
  from pg_policies where schemaname = 'public' group by tablename
) p on p.tablename = c.relname
left join (
  select table_name,
    string_agg(case when grantee in ('anon','authenticated') then grantee || ':' || privilege_type end, ', ' order by grantee, privilege_type) as client_grants,
    string_agg(case when grantee = 'service_role' then privilege_type end, ', ' order by privilege_type) as service_role_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'loop_watchlist'
    and grantee in ('anon','authenticated','service_role')
  group by table_name
) g on g.table_name = c.relname
where n.nspname = 'public' and c.relname = 'loop_watchlist' and c.relkind = 'r';

select
  p.proname,
  p.prosecdef as security_definer,
  p.proowner::regrole::text as owner,
  p.proconfig as function_settings,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'loop_my_watchlist';

-- Expected gate at time of review:
-- * Do not infer a safe invoker conversion until caller + grants + SELECT policies
--   on loop_titles and bridge_loop_publications are reviewed together.
-- * Do not create a policy on loop_watchlist unless a direct-client access need
--   is established; current application access is server-side.
