do $$
declare r record;
begin
  for r in
    select n.nspname schema_name,c.relname table_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    left join pg_policy p on p.polrelid=c.oid
    where c.relkind='r' and c.relrowsecurity=true
      and p.polname is null
      and n.nspname in ('public','legacy_import')
  loop
    execute format('create policy %I on %I.%I for all to anon, authenticated using (false) with check (false)',
      'deny_client_access',r.schema_name,r.table_name);
  end loop;
end $$;
