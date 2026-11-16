-- Preserve unresolved legacy source references without inventing a title/order target.
-- Browser roles receive no access; server-side service_role only.
create table if not exists public.streamvista_legacy_links (
  source_table text not null,
  legacy_id text not null,
  order_id uuid null,
  bridge_title_id text null,
  review_status text not null default 'pending',
  reviewed_by text null,
  reviewed_at timestamptz null,
  resolution_status text not null default 'resolved',
  constraint streamvista_legacy_links_pkey primary key (source_table, legacy_id),
  constraint streamvista_legacy_links_bridge_title_id_fkey
    foreign key (bridge_title_id) references public.bridge_titles(id) on delete restrict
);

alter table public.streamvista_legacy_links
  add column if not exists resolution_status text not null default 'resolved';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='streamvista_legacy_links_source_table_check'
                 and conrelid='public.streamvista_legacy_links'::regclass) then
    alter table public.streamvista_legacy_links add constraint streamvista_legacy_links_source_table_check
      check (source_table = any (array['accounts_user','films_film','films_filmdraft','films_filmbuyermapping','films_payment','films_status','films_viewhistory']::text[]));
  end if;
  if not exists (select 1 from pg_constraint where conname='streamvista_legacy_links_review_status_check'
                 and conrelid='public.streamvista_legacy_links'::regclass) then
    alter table public.streamvista_legacy_links add constraint streamvista_legacy_links_review_status_check
      check (review_status = any (array['pending','verified','rejected']::text[]));
  end if;
  if not exists (select 1 from pg_constraint where conname='streamvista_link_review'
                 and conrelid='public.streamvista_legacy_links'::regclass) then
    alter table public.streamvista_legacy_links add constraint streamvista_link_review
      check (review_status <> 'verified' or (reviewed_by is not null and reviewed_at is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname='streamvista_legacy_links_resolution_status_check'
                 and conrelid='public.streamvista_legacy_links'::regclass) then
    alter table public.streamvista_legacy_links add constraint streamvista_legacy_links_resolution_status_check
      check (resolution_status = any (array['resolved','unresolved','rejected']::text[]));
  end if;
  if not exists (select 1 from pg_constraint where conname='streamvista_link_target'
                 and conrelid='public.streamvista_legacy_links'::regclass) then
    alter table public.streamvista_legacy_links add constraint streamvista_link_target
      check (
        (resolution_status = 'resolved' and (order_id is not null or bridge_title_id is not null))
        or (resolution_status = 'unresolved' and review_status = 'pending' and order_id is null and bridge_title_id is null)
        or (resolution_status = 'rejected' and review_status = 'rejected')
      );
  end if;
end $$;

alter table public.streamvista_legacy_links enable row level security;
revoke all on table public.streamvista_legacy_links from public, anon, authenticated;
grant all on table public.streamvista_legacy_links to service_role;
