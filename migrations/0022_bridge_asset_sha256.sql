-- Add content digests without conflating them with OCI ETags.
-- Forward-only and safe to apply to Testing/Preview before Production promotion.
alter table if exists public.bridge_assets
  add column if not exists sha256 text,
  add column if not exists checksum_sha256 text;

alter table if exists public.bridge_assets
  drop constraint if exists bridge_assets_sha256_format_chk;

alter table if exists public.bridge_assets
  add constraint bridge_assets_sha256_format_chk
  check (
    (sha256 is null or sha256 ~ '^[a-f0-9]{64}$')
    and (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$')
  );

comment on column public.bridge_assets.sha256 is
  'SHA-256 of verified object bytes; not an OCI ETag.';
comment on column public.bridge_assets.checksum_sha256 is
  'Canonical SHA-256 of verified object bytes; not an OCI ETag.';
