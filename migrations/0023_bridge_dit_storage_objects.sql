-- Actual OCI object evidence for each DIT source file and its Primary/Recovery copies.
-- Browser clients receive only short-lived signed PUT URLs; evidence writes are server-only.
create table if not exists public.bridge_dit_storage_objects (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  relative_path text not null,
  copy_type text not null check (copy_type in ('PRIMARY', 'RECOVERY')),
  bucket_name text not null check (length(trim(bucket_name)) > 0),
  object_key text not null check (length(trim(object_key)) > 0),
  sha256 char(64) not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size >= 0),
  etag text,
  status text not null default 'UPLOAD_PENDING'
    check (status in ('UPLOAD_PENDING', 'VERIFIED', 'FAILED')),
  verified_at timestamptz,
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, relative_path)
    references public.bridge_dit_ingest_files(session_id, relative_path)
    on delete cascade,
  unique (session_id, relative_path, copy_type),
  unique (bucket_name, object_key),
  check ((status = 'VERIFIED') = (verified_at is not null and etag is not null))
);

create index if not exists bridge_dit_storage_objects_session_status_idx
  on public.bridge_dit_storage_objects (session_id, status, copy_type);

create index if not exists bridge_dit_storage_objects_bucket_key_idx
  on public.bridge_dit_storage_objects (bucket_name, object_key);

alter table public.bridge_dit_storage_objects enable row level security;
alter table public.bridge_dit_storage_objects force row level security;
revoke all privileges on table public.bridge_dit_storage_objects from public, anon, authenticated;
