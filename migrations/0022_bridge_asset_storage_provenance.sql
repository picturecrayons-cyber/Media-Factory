-- Record the configured object-storage target on each Bridge asset.
-- The existing s3_key column remains the canonical object path/key.
alter table bridge_assets
  add column if not exists storage_provider text,
  add column if not exists storage_bucket text,
  add column if not exists storage_namespace text,
  add column if not exists storage_region text,
  add column if not exists storage_endpoint text;

alter table bridge_assets
  add constraint bridge_assets_storage_provider_check
  check (storage_provider is null or storage_provider in ('oci', 'aws_s3', 'cloudflare_r2'));

-- No browser grants or RLS policy changes: provenance is exposed only through
-- the existing authorized server function, which redacts it for Buyer accounts.
