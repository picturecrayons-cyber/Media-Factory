-- RECOVERED APPLIED SQL BODY — STAGING / Testing DB ONLY.
-- Ledger: supabase_migrations.schema_migrations
-- Version: 20261116233444
-- Name: streamvista_legacy_links_unresolved_resolution_state
-- Serialized statement bytes: 1634
-- Ledger statement serialization SHA-256: ae8ef1ccf6dff166c34dc66f2350e974a57e14624b590a497d323bfe5bb2be57
-- READ-ONLY retrieved from project jbymleftneggcgutlcqu on 2026-11-17.
-- Archival evidence only. NOT an active migration. Do not apply to any hosted DB.

create table public.streamvista_legacy_links (
  source_table text not null,
  legacy_id text not null,
  order_id uuid null,
  bridge_title_id text null,
  review_status text not null default 'pending',
  reviewed_by text null,
  reviewed_at timestamptz null,
  resolution_status text not null default 'resolved',
  constraint streamvista_legacy_links_pkey primary key (source_table, legacy_id),
  constraint streamvista_legacy_links_source_table_check
    check (source_table = any (array['accounts_user','films_film','films_filmdraft','films_filmbuyermapping','films_payment','films_status','films_viewhistory']::text[])),
  constraint streamvista_legacy_links_review_status_check
    check (review_status = any (array['pending','verified','rejected']::text[])),
  constraint streamvista_link_review
    check (review_status <> 'verified' or (reviewed_by is not null and reviewed_at is not null)),
  constraint streamvista_legacy_links_resolution_status_check
    check (resolution_status = any (array['resolved','unresolved','rejected']::text[])),
  constraint streamvista_link_target
    check (
      (resolution_status = 'resolved' and (order_id is not null or bridge_title_id is not null))
      or
      (resolution_status = 'unresolved' and review_status = 'pending' and order_id is null and bridge_title_id is null)
      or
      (resolution_status = 'rejected' and review_status = 'rejected')
    ),
  constraint streamvista_legacy_links_bridge_title_id_fkey
    foreign key (bridge_title_id) references public.bridge_titles(id) on delete restrict
);
alter table public.streamvista_legacy_links enable row level security;
