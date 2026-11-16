
create table if not exists public.loop_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title_id uuid not null references public.loop_titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint loop_watchlists_user_title_key unique (user_id, title_id)
);

create index if not exists loop_watchlists_user_id_idx
  on public.loop_watchlists(user_id);

create index if not exists loop_watchlists_title_id_idx
  on public.loop_watchlists(title_id);

alter table public.loop_watchlists enable row level security;

drop policy if exists loop_watchlists_own_read on public.loop_watchlists;
create policy loop_watchlists_own_read
  on public.loop_watchlists
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists loop_watchlists_own_insert on public.loop_watchlists;
create policy loop_watchlists_own_insert
  on public.loop_watchlists
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists loop_watchlists_own_delete on public.loop_watchlists;
create policy loop_watchlists_own_delete
  on public.loop_watchlists
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.loop_watchlists to authenticated;
