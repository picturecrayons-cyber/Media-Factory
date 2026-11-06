-- Server-authoritative multipart manifests and immutable storage provenance.
-- Apply only after staging isolation and RLS policy review. This migration is additive.
begin;

create schema if not exists bridge_private;

alter table public.bridge_assets
  drop constraint if exists bridge_assets_kind_chk;
alter table public.bridge_assets
  add constraint bridge_assets_kind_chk check (kind in ('poster','poster_vertical','poster_horizontal','thumbnail','screener','master','subtitle','technical','censor_certificate'));

alter table public.bridge_assets
  add column if not exists storage_provider text,
  add column if not exists storage_bucket text,
  add column if not exists storage_namespace text,
  add column if not exists storage_region text,
  add column if not exists storage_endpoint text,
  add column if not exists checksum_sha256 text,
  add column if not exists source_object_key text,
  add column if not exists verified_object_key text,
  add column if not exists object_version_id text,
  add column if not exists object_generation text,
  add column if not exists storage_verified_at timestamptz;

update public.bridge_assets
set source_object_key = coalesce(source_object_key, s3_key)
where source_object_key is null;

alter table public.bridge_assets
  add constraint bridge_assets_storage_provider_chk
    check (storage_provider is null or storage_provider in ('oci','aws_s3','cloudflare_r2','supabase_storage')),
  add constraint bridge_assets_checksum_sha256_chk
    check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint bridge_assets_verified_pointer_chk
    check (
      (verified_object_key is null and storage_verified_at is null)
      or (verified_object_key is not null and storage_verified_at is not null
          and checksum_sha256 is not null and storage_provider is not null
          and storage_bucket is not null)
    );

create index if not exists bridge_assets_verified_title_idx
  on public.bridge_assets (title_id, storage_verified_at desc)
  where verified_object_key is not null;
create index if not exists bridge_assets_checksum_idx
  on public.bridge_assets (checksum_sha256)
  where checksum_sha256 is not null;

create or replace function bridge_private.prevent_verified_asset_pointer_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $bridge_function$
begin
  if old.verified_object_key is not null and (
    new.verified_object_key is distinct from old.verified_object_key
    or new.checksum_sha256 is distinct from old.checksum_sha256
    or new.storage_provider is distinct from old.storage_provider
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_namespace is distinct from old.storage_namespace
    or new.storage_region is distinct from old.storage_region
    or new.storage_endpoint is distinct from old.storage_endpoint
    or new.object_version_id is distinct from old.object_version_id
    or new.object_generation is distinct from old.object_generation
  ) then
    raise exception 'Verified storage pointer and provenance are immutable';
  end if;
  return new;
end;
$bridge_function$;

drop trigger if exists bridge_assets_verified_pointer_immutable on public.bridge_assets;
create trigger bridge_assets_verified_pointer_immutable
before update on public.bridge_assets
for each row execute function bridge_private.prevent_verified_asset_pointer_mutation();

create table if not exists bridge_private.upload_sessions (
  id text primary key,
  asset_id text not null references public.bridge_assets(id) on delete cascade,
  actor_user_id text not null,
  actor_is_internal boolean not null default false,
  provider text not null check (provider in ('oci','aws_s3','cloudflare_r2')),
  bucket text not null,
  namespace text,
  region text not null,
  endpoint text not null,
  source_object_key text not null,
  provider_upload_id text not null,
  part_base_url text not null,
  expected_size bigint not null check (expected_size > 0),
  part_size integer not null check (part_size between 5242880 and 67108864),
  state text not null default 'initiated'
    check (state in ('initiated','uploading','assembling','verification_pending','verified','failed','aborted','expired')),
  idempotency_key text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, idempotency_key),
  unique (provider, bucket, provider_upload_id)
);

create index if not exists bridge_upload_sessions_state_expiry_idx
  on bridge_private.upload_sessions (state, expires_at);

create table if not exists bridge_private.upload_parts (
  session_id text not null references bridge_private.upload_sessions(id) on delete cascade,
  part_number integer not null check (part_number > 0),
  byte_start bigint not null check (byte_start >= 0),
  byte_end bigint not null check (byte_end > byte_start),
  byte_length bigint generated always as (byte_end - byte_start) stored,
  etag text not null check (length(etag) between 1 and 512),
  provider_checksum text,
  recorded_at timestamptz not null default now(),
  primary key (session_id, part_number)
);

create table if not exists bridge_private.asset_verification_jobs (
  id bigserial primary key,
  asset_id text not null references public.bridge_assets(id) on delete cascade,
  session_id text not null references bridge_private.upload_sessions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id)
);

create index if not exists bridge_asset_verification_jobs_claim_idx
  on bridge_private.asset_verification_jobs (available_at, created_at)
  where status in ('queued','failed');

alter table bridge_private.upload_sessions enable row level security;
alter table bridge_private.upload_sessions force row level security;
alter table bridge_private.upload_parts enable row level security;
alter table bridge_private.upload_parts force row level security;
alter table bridge_private.asset_verification_jobs enable row level security;
alter table bridge_private.asset_verification_jobs force row level security;

revoke all on schema bridge_private from public, anon, authenticated;
revoke all on all tables in schema bridge_private from public, anon, authenticated;
revoke all on all sequences in schema bridge_private from public, anon, authenticated;

commit;
