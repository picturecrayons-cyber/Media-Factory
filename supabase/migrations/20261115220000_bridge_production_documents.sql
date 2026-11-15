-- Extend the Production asset register to represent legal/document assets
-- without misclassifying them as video or artwork.
--
-- The deployed register predates tracked migrations. This migration establishes
-- its schema for clean Supabase environments and safely extends the existing
-- production table. Existing owner-only identity binding is preserved.

create table if not exists public.bridge_production_assets (
  id uuid primary key default gen_random_uuid(),
  title_id text not null
    references public.bridge_titles(id) on update restrict on delete restrict,
  category text not null,
  file_name text not null,
  file_path text not null,
  file_size bigint not null,
  content_type text,
  tags jsonb default '{}'::jsonb,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint bridge_production_assets_category_check
    check (category in ('raw_video', 'pilot_audio', 'stills', 'ad_reports', 'ad_logs', 'documents'))
);

alter table public.bridge_production_assets
  drop constraint if exists bridge_production_assets_category_check;

alter table public.bridge_production_assets
  add constraint bridge_production_assets_category_check
  check (category in ('raw_video', 'pilot_audio', 'stills', 'ad_reports', 'ad_logs', 'documents'));

create index if not exists bridge_production_assets_title_id_idx
  on public.bridge_production_assets(title_id);

alter table public.bridge_production_assets enable row level security;

drop policy if exists bridge_production_assets_owner_select
  on public.bridge_production_assets;
create policy bridge_production_assets_owner_select
  on public.bridge_production_assets
  for select to authenticated
  using (
    exists (
      select 1
      from public.bridge_titles t
      join public.bridge_loop_identity_links l
        on l.bridge_user_id = t.owner_user_id
      where t.id = bridge_production_assets.title_id
        and l.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists bridge_production_assets_owner_insert
  on public.bridge_production_assets;
create policy bridge_production_assets_owner_insert
  on public.bridge_production_assets
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.bridge_titles t
      join public.bridge_loop_identity_links l
        on l.bridge_user_id = t.owner_user_id
      where t.id = bridge_production_assets.title_id
        and l.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists bridge_production_assets_owner_update
  on public.bridge_production_assets;
create policy bridge_production_assets_owner_update
  on public.bridge_production_assets
  for update to authenticated
  using (
    exists (
      select 1
      from public.bridge_titles t
      join public.bridge_loop_identity_links l
        on l.bridge_user_id = t.owner_user_id
      where t.id = bridge_production_assets.title_id
        and l.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.bridge_titles t
      join public.bridge_loop_identity_links l
        on l.bridge_user_id = t.owner_user_id
      where t.id = bridge_production_assets.title_id
        and l.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists bridge_production_assets_owner_delete
  on public.bridge_production_assets;
create policy bridge_production_assets_owner_delete
  on public.bridge_production_assets
  for delete to authenticated
  using (
    exists (
      select 1
      from public.bridge_titles t
      join public.bridge_loop_identity_links l
        on l.bridge_user_id = t.owner_user_id
      where t.id = bridge_production_assets.title_id
        and l.auth_user_id = (select auth.uid())
    )
  );

revoke all on table public.bridge_production_assets from public, anon;
grant select, insert, update, delete
  on table public.bridge_production_assets to authenticated;
grant all on table public.bridge_production_assets to service_role;
