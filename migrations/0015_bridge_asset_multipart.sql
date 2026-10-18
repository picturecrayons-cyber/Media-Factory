-- Durable state for resumable OCI multipart uploads. No existing asset rows are modified.
alter table bridge_assets
  add column if not exists multipart_upload_id text,
  add column if not exists upload_expected_byte_size bigint,
  add column if not exists upload_expected_sha256 text,
  add column if not exists checksum_sha256 text,
  add column if not exists upload_parts jsonb not null default '[]'::jsonb,
  add column if not exists upload_state text;

create index if not exists bridge_assets_pending_multipart_idx
  on bridge_assets (title_id, created_by)
  where multipart_upload_id is not null and byte_size is null;
