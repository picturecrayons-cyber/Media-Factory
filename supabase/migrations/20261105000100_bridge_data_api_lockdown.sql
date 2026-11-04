-- Crayons Bridge — server-only Supabase Data API boundary.
-- Intended first for isolated STAGING project jbymleftneggcgutlcqu.
-- Do not apply to PRODUCTION without a separate release approval.
--
-- Architecture verified in source:
-- - Browser Supabase client is used for Supabase Auth session management.
-- - Bridge table reads/writes use server-only getSql() via DATABASE_URL/POSTGRES_URL.
-- - Bridge authorization is Better Auth + server-side RBAC.
-- - The only searched supabase.from() table access is the Razorpay Edge Function,
--   which uses the server-only service_role key.
--
-- Fail closed if this is not the expected Bridge-only public schema / owner.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Refusing Bridge Data API lockdown: migration must run as postgres owner';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p','S')
      and c.relname not like 'bridge\_%' escape '\\'
  ) then
    raise exception 'Refusing Bridge Data API lockdown: non-Bridge public relation found';
  end if;
end
$$;

-- All 32 current public tables are Bridge operational tables. Browser roles
-- must not access them directly; server-side Postgres remains the authorized path.
revoke all privileges on all tables in schema public from anon, authenticated;

-- Sequences are not protected by RLS. Remove direct sequence access as well.
revoke all privileges on all sequences in schema public from anon, authenticated;

-- Supabase default ACLs had been granting all table/sequence privileges to
-- anon and authenticated for new objects created by postgres. Stop recurrence.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;

-- Keep RLS enabled as defense in depth. Do not add blanket policies or
-- auth.uid()-based policies: Bridge identity is resolved server-side.
