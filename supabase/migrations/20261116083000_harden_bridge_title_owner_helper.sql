-- Harden the ownership helper used by Production-asset RLS policies.
-- All referenced objects are schema-qualified, so the definer search path
-- can be restricted to pg_catalog only.
--
-- Keep EXECUTE available to authenticated: the RLS policy must call this
-- helper during row authorization. The function returns only an ownership
-- boolean, binds to auth.uid(), and is not executable by anon or PUBLIC.

create or replace function public.bridge_is_title_owner(p_title_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $bridge_owner$
  select exists (
    select 1
    from public.bridge_titles t
    join public.bridge_loop_identity_links l
      on l.bridge_user_id = t.owner_user_id
    where t.id = p_title_id
      and l.auth_user_id = (select auth.uid())
  );
$bridge_owner$;

revoke all on function public.bridge_is_title_owner(text) from public, anon;
grant execute on function public.bridge_is_title_owner(text) to authenticated;
