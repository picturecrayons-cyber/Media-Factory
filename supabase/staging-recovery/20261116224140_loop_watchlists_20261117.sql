-- RECOVERED SOURCE — STAGING / Testing DB ONLY.
-- Ledger: supabase_migrations.schema_migrations
-- Version: 20261116224140
-- Name: loop_watchlists_20261117
-- Exact stored statement bytes: 1310
-- Exact stored statement MD5: fc527f3c6f07593e070f488dde59dbc1
-- Exact stored statement SHA-256: 677b2b2cf9453b12dbe89876ac4f9aa814eba4d8fd1580da5b8d7d81a2576fc4
-- READ-ONLY recovered from project jbymleftneggcgutlcqu on 2026-11-17.
-- This file is an archival source copy, NOT an active migration.
-- Do not move into supabase/migrations or apply to any hosted database.

create table if not exists public.loop_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id text not null references public.loop_titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint loop_watchlists_user_title_key unique (user_id, title_id)
);
create index if not exists loop_watchlists_user_created_idx
  on public.loop_watchlists (user_id, created_at desc);
alter table public.loop_watchlists enable row level security;
drop policy if exists loop_watchlists_select_own on public.loop_watchlists;
create policy loop_watchlists_select_own on public.loop_watchlists
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists loop_watchlists_insert_own on public.loop_watchlists;
create policy loop_watchlists_insert_own on public.loop_watchlists
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists loop_watchlists_delete_own on public.loop_watchlists;
create policy loop_watchlists_delete_own on public.loop_watchlists
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.loop_watchlists from anon;
grant select, insert, delete on public.loop_watchlists to authenticated;