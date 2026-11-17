-- Never treat an imported target as authoritative until a reviewer verifies it.
-- Preserve old suggested targets in candidate columns, and clear the active
-- target for pending/rejected links. This is a fail-closed migration.

create table if not exists public.streamvista_legacy_links (
  source_table text not null,
  legacy_id text not null,
  order_id uuid null,
  bridge_title_id text null,
  candidate_order_id uuid null,
  candidate_bridge_title_id text null,
  review_status text not null default 'pending',
  reviewed_by text null,
  reviewed_at timestamptz null,
  resolution_status text not null default 'unresolved',
  constraint streamvista_legacy_links_pkey primary key (source_table, legacy_id),
  constraint streamvista_legacy_links_bridge_title_id_fkey
    foreign key (bridge_title_id) references public.bridge_titles(id) on delete restrict,
  constraint streamvista_legacy_links_candidate_bridge_title_id_fkey
    foreign key (candidate_bridge_title_id) references public.bridge_titles(id) on delete restrict
);

alter table public.streamvista_legacy_links
  add column if not exists candidate_order_id uuid,
  add column if not exists candidate_bridge_title_id text,
  add column if not exists resolution_status text not null default 'unresolved';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'streamvista_legacy_links_candidate_order_id_fkey'
      and conrelid = 'public.streamvista_legacy_links'::regclass
  ) then
    alter table public.streamvista_legacy_links
      add constraint streamvista_legacy_links_candidate_order_id_fkey
      foreign key (candidate_order_id) references public.streamvista_orders(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'streamvista_legacy_links_candidate_bridge_title_id_fkey'
      and conrelid = 'public.streamvista_legacy_links'::regclass
  ) then
    alter table public.streamvista_legacy_links
      add constraint streamvista_legacy_links_candidate_bridge_title_id_fkey
      foreign key (candidate_bridge_title_id) references public.bridge_titles(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'streamvista_legacy_links_source_table_check'
      and conrelid = 'public.streamvista_legacy_links'::regclass
  ) then
    alter table public.streamvista_legacy_links
      add constraint streamvista_legacy_links_source_table_check
      check (source_table = any (array[
        'accounts_user','films_film','films_filmdraft',
        'films_filmbuyermapping','films_payment','films_status',
        'films_viewhistory'
      ]::text[]));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'streamvista_legacy_links_review_status_check'
      and conrelid = 'public.streamvista_legacy_links'::regclass
  ) then
    alter table public.streamvista_legacy_links
      add constraint streamvista_legacy_links_review_status_check
      check (review_status = any (array['pending','verified','rejected']::text[]));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'streamvista_link_review'
      and conrelid = 'public.streamvista_legacy_links'::regclass
  ) then
    alter table public.streamvista_legacy_links
      add constraint streamvista_link_review
      check (review_status <> 'verified' or (
        reviewed_by is not null and reviewed_at is not null
      ));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'streamvista_legacy_links_resolution_status_check'
      and conrelid = 'public.streamvista_legacy_links'::regclass
  ) then
    alter table public.streamvista_legacy_links
      add constraint streamvista_legacy_links_resolution_status_check
      check (resolution_status = any (array['resolved','unresolved','rejected']::text[]));
  end if;
end
$$;

-- A verified row without an active title/order target is contradictory.
-- Stop instead of silently downgrading a prior human verification.
do $$
begin
  if exists (
    select 1
    from public.streamvista_legacy_links
    where review_status = 'verified'
      and order_id is null
      and bridge_title_id is null
  ) then
    raise exception
      'Legacy-link migration blocked: a verified mapping has no active target';
  end if;
end
$$;

-- Keep suggested targets for later review, but remove them from active use.
update public.streamvista_legacy_links
set
  candidate_order_id = case
    when review_status in ('pending','rejected')
      then coalesce(candidate_order_id, order_id)
    else candidate_order_id
  end,
  candidate_bridge_title_id = case
    when review_status in ('pending','rejected')
      then coalesce(candidate_bridge_title_id, bridge_title_id)
    else candidate_bridge_title_id
  end,
  order_id = case when review_status in ('pending','rejected') then null else order_id end,
  bridge_title_id = case when review_status in ('pending','rejected') then null else bridge_title_id end,
  resolution_status = case
    when review_status = 'verified' then 'resolved'
    when review_status = 'rejected' then 'rejected'
    else 'unresolved'
  end;

alter table public.streamvista_legacy_links
  drop constraint if exists streamvista_link_target;

alter table public.streamvista_legacy_links
  add constraint streamvista_link_target
  check (
    (
      resolution_status = 'resolved'
      and review_status = 'verified'
      and (order_id is not null or bridge_title_id is not null)
    )
    or (
      resolution_status = 'unresolved'
      and review_status = 'pending'
      and order_id is null
      and bridge_title_id is null
    )
    or (
      resolution_status = 'rejected'
      and review_status = 'rejected'
      and order_id is null
      and bridge_title_id is null
    )
  );

create index if not exists streamvista_legacy_links_candidate_title_idx
  on public.streamvista_legacy_links (candidate_bridge_title_id)
  where candidate_bridge_title_id is not null;

create index if not exists streamvista_legacy_links_candidate_order_idx
  on public.streamvista_legacy_links (candidate_order_id)
  where candidate_order_id is not null;

alter table public.streamvista_legacy_links enable row level security;
revoke all on table public.streamvista_legacy_links from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.streamvista_legacy_links to service_role;
