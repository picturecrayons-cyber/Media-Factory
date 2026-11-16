-- PROPOSAL ONLY — STAGING / Testing DB lineage.
-- Do not place in supabase/migrations and do not apply to any hosted database
-- until the exact STAGING source lineage, schema diff, rollback plan, and
-- separate STAGING WRITE approval are complete.
--
-- Function observed in STAGING DB jbymleftneggcgutlcqu:
-- public.has_active_loop_tvod_entitlement(text)
-- SECURITY DEFINER, search_path = public, auth, pg_temp.
--
-- This change preserves SECURITY DEFINER semantics and the existing caller
-- grants (authenticated + service_role), while removing mutable schemas from
-- the function search path. All relation/function references are qualified.
-- Verify this exact function signature and dependencies before any application.

create or replace function public.has_active_loop_tvod_entitlement(p_title_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.loop_user_tvod_entitlements as e
    where e.user_id = auth.uid()
      and e.title_id = p_title_id
      and e.access_type = 'RENTAL'
      and e.status = 'ACTIVE'
      and e.expires_at is not null
      and e.expires_at > pg_catalog.now()
  );
$function$;

-- Make the intended callable roles explicit without broadening access.
revoke all on function public.has_active_loop_tvod_entitlement(text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_active_loop_tvod_entitlement(text)
  to authenticated, service_role;
