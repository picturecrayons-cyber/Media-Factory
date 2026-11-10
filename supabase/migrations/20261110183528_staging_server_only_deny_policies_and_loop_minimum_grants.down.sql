-- STAGING rollback for 20261110183528.
-- Run 20261110183943 down first, then this file, then 20261110183454 down.
-- This removes only the deny_browser_access policies created for server-only tables.
do $block$
declare r record;
begin
  for r in
    select schemaname, tablename
    from pg_catalog.pg_policies
    where schemaname in ('public','bridge_private')
      and policyname = 'deny_browser_access'
  loop
    execute pg_catalog.format('drop policy if exists %I on %I.%I',
      'deny_browser_access', r.schemaname, r.tablename);
  end loop;
end
$block$;
-- The six Loop tables retain the safer minimum service_role CRUD grants if
-- this security-only rollback is performed without dropping the tables.
