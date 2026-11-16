-- Narrow hardening for tables whose RLS policy explicitly denies all client access.
-- Does not alter row-level policies, authenticated owner/buyer workflows, or server-role grants.
-- This migration is intended for reviewed non-production validation before any deployment.

begin;

-- Non-row privileges are never required by the Bridge/Loop browser clients.
-- Keep SELECT/INSERT/UPDATE/DELETE decisions in RLS and application contracts.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

do $$
declare
  target record;
begin
  for target in
    select distinct p.schemaname, p.tablename
    from pg_policies p
    where p.schemaname = 'public'
      and p.cmd = 'ALL'
      and p.qual = 'false'
      and p.with_check = 'false'
      and p.roles @> array['anon', 'authenticated']::name[]
  loop
    execute format(
      'revoke all privileges on table %I.%I from anon, authenticated',
      target.schemaname,
      target.tablename
    );
  end loop;
end
$$;

-- Guard the intended outcome. Any regression aborts the migration transaction.
do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants g
    join pg_policies p
      on p.schemaname = g.table_schema
     and p.tablename = g.table_name
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated')
      and p.cmd = 'ALL'
      and p.qual = 'false'
      and p.with_check = 'false'
      and p.roles @> array['anon', 'authenticated']::name[]
  ) then
    raise exception 'Client table grants remain on explicit deny-all RLS tables';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated')
      and g.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'Non-row client privileges remain in public schema';
  end if;
end
$$;

commit;
