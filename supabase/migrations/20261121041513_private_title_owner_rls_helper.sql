-- STAGING-first hardening of the title-owner SECURITY DEFINER helper.
-- Keep policy semantics unchanged while moving the callable helper out of public.
-- This migration is validated against Crayons Testing DB only.

create or replace function private.bridge_is_title_owner(p_title_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $bridge_owner$
  select exists (
    select 1
    from public.bridge_titles as t
    join public.bridge_loop_identity_links as l
      on l.bridge_user_id = t.owner_user_id
    where t.id = p_title_id
      and l.auth_user_id = (select auth.uid())
  );
$bridge_owner$;

revoke all on function private.bridge_is_title_owner(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.bridge_is_title_owner(text) to authenticated;

drop policy if exists bridge_production_assets_owner_select on public.bridge_production_assets;
create policy bridge_production_assets_owner_select
  on public.bridge_production_assets
  for select to authenticated
  using (private.bridge_is_title_owner(title_id));

drop policy if exists bridge_production_assets_owner_insert on public.bridge_production_assets;
create policy bridge_production_assets_owner_insert
  on public.bridge_production_assets
  for insert to authenticated
  with check (private.bridge_is_title_owner(title_id));

drop policy if exists bridge_production_assets_owner_update on public.bridge_production_assets;
create policy bridge_production_assets_owner_update
  on public.bridge_production_assets
  for update to authenticated
  using (private.bridge_is_title_owner(title_id))
  with check (private.bridge_is_title_owner(title_id));

drop policy if exists bridge_production_assets_owner_delete on public.bridge_production_assets;
create policy bridge_production_assets_owner_delete
  on public.bridge_production_assets
  for delete to authenticated
  using (private.bridge_is_title_owner(title_id));

-- Keep the legacy public function as a rollback artifact, but make RPC unavailable.
revoke all on function public.bridge_is_title_owner(text) from public, anon, authenticated;
