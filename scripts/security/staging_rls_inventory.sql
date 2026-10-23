-- Read-only inventory for the Staging Supabase security review.
-- Run only against project bbtrosuwisnxacuxvegt.
-- This script performs SELECTs only; it does not alter policies, grants, functions, data or Auth settings.

-- 1) Tables with RLS enabled but no policies.
select n.nspname as schema_name, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = n.nspname and p.tablename = c.relname
  )
order by c.relname;

-- 2) Columns and defaults.
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 3) Foreign keys.
select tc.table_name, tc.constraint_name, kcu.column_name,
       ccu.table_name as referenced_table, ccu.column_name as referenced_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.constraint_schema = tc.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.constraint_schema = tc.constraint_schema
where tc.table_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- 4) Effective table-level grants.
select table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
order by table_name, grantee, privilege_type;

-- 5) Current RLS policies.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 6) loop_my_watchlist definition and security properties.
select n.nspname as schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_functiondef(p.oid) as definition,
       p.prosecdef as security_definer,
       p.proconfig as function_config,
       pg_get_userbyid(p.proowner) as owner,
       p.proacl as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'loop_my_watchlist';

-- 7) Routines referencing the watchlist function via SQL bodies can require
-- source search too; catalog dependencies alone do not reveal all app/API callers.
select n.nspname as schema_name, p.proname as routine_name,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ilike '%loop_my_watchlist%'
order by p.proname;
