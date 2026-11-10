-- Record the configured object-storage target on each Bridge asset.
-- The existing s3_key column remains the canonical object path/key.
alter table public.bridge_assets
  add column if not exists storage_provider text,
  add column if not exists storage_bucket text,
  add column if not exists storage_namespace text,
  add column if not exists storage_region text,
  add column if not exists storage_endpoint text;

alter table public.bridge_assets
  drop constraint if exists bridge_assets_storage_provider_check;

alter table public.bridge_assets
  add constraint bridge_assets_storage_provider_check
  check (storage_provider is null or storage_provider in ('oci', 'aws_s3', 'cloudflare_r2'));

create index if not exists bridge_assets_storage_provider_idx
  on public.bridge_assets(storage_provider)
  where storage_provider is not null;
create index if not exists bridge_assets_storage_bucket_idx
  on public.bridge_assets(storage_bucket)
  where storage_bucket is not null;