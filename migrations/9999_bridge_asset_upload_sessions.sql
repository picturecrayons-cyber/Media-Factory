-- Durable, resumable OCI multipart upload sessions. PAR bearer URLs are stored encrypted.
create table if not exists bridge_asset_upload_sessions (
  id text primary key,
  asset_id text not null references bridge_assets(id) on delete cascade,
  title_id text not null references bridge_titles(id) on delete cascade,
  created_by text not null,
  object_key text not null,
  filename text not null,
  content_type text not null,
  file_size bigint not null check (file_size > 0),
  part_size bigint not null check (part_size > 0),
  upload_id text not null,
  encrypted_access_uri text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','COMMITTING','COMMITTED','COMPLETED','ABORTED','FAILED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists bridge_asset_upload_sessions_owner_idx
  on bridge_asset_upload_sessions (created_by, updated_at desc);
create index if not exists bridge_asset_upload_sessions_active_idx
  on bridge_asset_upload_sessions (expires_at)
  where status in ('ACTIVE','COMMITTING','COMMITTED');

create table if not exists bridge_asset_upload_parts (
  session_id text not null references bridge_asset_upload_sessions(id) on delete cascade,
  part_number integer not null check (part_number between 1 and 10000),
  etag text not null check (length(etag) > 0),
  byte_size bigint not null check (byte_size > 0),
  updated_at timestamptz not null default now(),
  primary key (session_id, part_number)
);
