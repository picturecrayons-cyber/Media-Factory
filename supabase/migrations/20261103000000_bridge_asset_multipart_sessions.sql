-- CRA-38: durable server-side state for OCI multipart ingest sessions.
-- This migration is code-only until separately reviewed and explicitly approved.
-- PAR URLs are bearer capabilities: this table is server-only and never exposed through the Data API.

create table if not exists public.bridge_asset_multipart_sessions (
  asset_id text primary key references public.bridge_assets(id) on delete cascade,
  title_id text not null references public.bridge_titles(id) on delete cascade,
  created_by text not null,
  object_key text not null,
  upload_id text not null,
  part_base_url_ciphertext text not null,
  file_name text not null check (length(file_name) between 1 and 255),
  file_size bigint not null check (file_size > 0),
  part_size integer not null check (part_size between 5242880 and 67108864),
  last_modified bigint not null default 0 check (last_modified >= 0),
  status text not null default 'active'
    check (status in ('active', 'committing', 'committed', 'expired', 'aborted', 'failed')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_asset_multipart_sessions_upload_unique unique (object_key, upload_id)
);

create index if not exists bridge_asset_multipart_sessions_owner_idx
  on public.bridge_asset_multipart_sessions (created_by, title_id, updated_at desc);

create index if not exists bridge_asset_multipart_sessions_expiry_idx
  on public.bridge_asset_multipart_sessions (expires_at)
  where status = 'active';

alter table public.bridge_asset_multipart_sessions enable row level security;

revoke all on table public.bridge_asset_multipart_sessions from anon, authenticated;
grant all on table public.bridge_asset_multipart_sessions to service_role;
