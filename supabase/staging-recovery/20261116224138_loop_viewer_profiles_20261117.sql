-- RECOVERED SOURCE — STAGING / Testing DB ONLY.
-- Ledger: supabase_migrations.schema_migrations
-- Version: 20261116224138
-- Name: loop_viewer_profiles_20261117
-- Exact stored statement bytes: 1704
-- Exact stored statement MD5: 2f36c875d5efc3cef79269bc349f6e5b
-- Exact stored statement SHA-256: de3610086b16e6401557764c5e251b8b579ed1eebd50b05ad7551cf132f81846
-- READ-ONLY recovered from project jbymleftneggcgutlcqu on 2026-11-17.
-- This file is an archival source copy, NOT an active migration.
-- Do not move into supabase/migrations or apply to any hosted database.

create table if not exists public.loop_viewer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 24),
  is_kids boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists loop_viewer_profiles_user_created_idx
  on public.loop_viewer_profiles (user_id, created_at);
alter table public.loop_viewer_profiles enable row level security;
drop policy if exists loop_viewer_profiles_select_own on public.loop_viewer_profiles;
create policy loop_viewer_profiles_select_own on public.loop_viewer_profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists loop_viewer_profiles_insert_own on public.loop_viewer_profiles;
create policy loop_viewer_profiles_insert_own on public.loop_viewer_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists loop_viewer_profiles_update_own on public.loop_viewer_profiles;
create policy loop_viewer_profiles_update_own on public.loop_viewer_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists loop_viewer_profiles_delete_own on public.loop_viewer_profiles;
create policy loop_viewer_profiles_delete_own on public.loop_viewer_profiles
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.loop_viewer_profiles from anon;
grant select, insert, update, delete on public.loop_viewer_profiles to authenticated;