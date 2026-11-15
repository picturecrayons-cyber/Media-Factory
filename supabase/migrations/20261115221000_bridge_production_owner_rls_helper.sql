-- Use a narrow security-definer helper for Production asset ownership.
-- Authenticated clients do not have direct SELECT privileges on bridge_titles
-- or bridge_loop_identity_links, so policy subqueries must not run as invoker.

create or replace function public.bridge_is_title_owner(p_title_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.bridge_titles t
    join public.bridge_loop_identity_links l
      on l.bridge_user_id = t.owner_user_id
    where t.id = p_title_id
      and l.auth_user_id = (select auth.uid())
  );
$$;

revoke all on function public.bridge_is_title_owner(text) from public, anon;
grant execute on function public.bridge_is_title_owner(text) to authenticated;

drop policy if exists bridge_production_assets_owner_select
  on public.bridge_production_assets;
create policy bridge_production_assets_owner_select
  on public.bridge_production_assets
  for select to authenticated
  using (public.bridge_is_title_owner(title_id));

drop policy if exists bridge_production_assets_owner_insert
  on public.bridge_production_assets;
create policy bridge_production_assets_owner_insert
  on public.bridge_production_assets
  for insert to authenticated
  with check (public.bridge_is_title_owner(title_id));

drop policy if exists bridge_production_assets_owner_update
  on public.bridge_production_assets;
create policy bridge_production_assets_owner_update
  on public.bridge_production_assets
  for update to authenticated
  using (public.bridge_is_title_owner(title_id))
  with check (public.bridge_is_title_owner(title_id));

drop policy if exists bridge_production_assets_owner_delete
  on public.bridge_production_assets;
create policy bridge_production_assets_owner_delete
  on public.bridge_production_assets
  for delete to authenticated
  using (public.bridge_is_title_owner(title_id));
