-- STAGING-only compatibility gate: expose the existing per-user Bridge role resolver
-- through a SECURITY INVOKER PostgREST wrapper. No role is accepted from caller input.
-- Also remove the legacy single-active-organization constraint so memberships
-- are unique per (organization_id, user_id), not globally per user.

create or replace function public.bridge_current_internal_role()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select bridge_private.current_internal_role();
$function$;

revoke all on function public.bridge_current_internal_role() from public, anon, authenticated;
grant execute on function public.bridge_current_internal_role() to authenticated;

comment on function public.bridge_current_internal_role() is
  'Authenticated-only, invoker wrapper returning the verified current user internal role; underlying resolver remains in bridge_private.';

drop index if exists public.bridge_organization_memberships_one_active_org_per_user;
