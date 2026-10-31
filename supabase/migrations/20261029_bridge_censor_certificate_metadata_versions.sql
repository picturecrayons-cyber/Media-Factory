-- Additive metadata for censor-certificate evidence. Apply only after an isolated Preview DB is verified.
-- Keep bridge_assets_kind_chk intact: existing asset kinds must continue to be accepted.
alter table public.bridge_assets
  add column if not exists original_filename text,
  add column if not exists sha256 text,
  add column if not exists replacement_requested_asset_id text references public.bridge_assets(id),
  add column if not exists supersedes_asset_id text references public.bridge_assets(id),
  add column if not exists certificate_duplicate_of_asset_id text references public.bridge_assets(id),
  add column if not exists asset_version_id uuid references public.bridge_asset_versions(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bridge_assets_sha256_format_chk'
      AND conrelid = 'public.bridge_assets'::regclass
  ) THEN
    ALTER TABLE public.bridge_assets
      ADD CONSTRAINT bridge_assets_sha256_format_chk
      CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

create index if not exists bridge_assets_certificate_fingerprint_idx
  on public.bridge_assets (title_id, kind, sha256)
  where kind = 'censor_certificate' and sha256 is not null;

create index if not exists bridge_assets_certificate_versions_idx
  on public.bridge_assets (title_id, created_at desc)
  where kind = 'censor_certificate';

-- One verified replacement can supersede a given certificate row at most once.
create unique index if not exists bridge_assets_certificate_supersedes_uidx
  on public.bridge_assets (supersedes_asset_id)
  where kind = 'censor_certificate' and supersedes_asset_id is not null;

create index if not exists bridge_assets_certificate_duplicate_idx
  on public.bridge_assets (certificate_duplicate_of_asset_id)
  where certificate_duplicate_of_asset_id is not null;

-- SHA-256 and bridge_asset_versions rows are written by trusted server-side verification.
