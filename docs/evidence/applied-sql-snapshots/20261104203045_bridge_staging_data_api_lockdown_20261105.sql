-- Crayons Bridge — server-only Supabase Data API boundary.
-- STAGING project jbymleftneggcgutlcqu ONLY. Production is explicitly out of scope.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Refusing Bridge Data API lockdown: migration must run as postgres owner';
  end if;
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p','S')
      and left(c.relname, 7) <> 'bridge_'
  ) then
    raise exception 'Refusing Bridge Data API lockdown: non-Bridge public relation found';
  end if;
end
$$;
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;