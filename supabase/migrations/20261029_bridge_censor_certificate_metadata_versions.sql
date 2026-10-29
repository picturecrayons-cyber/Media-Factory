-- Additive metadata for censor-certificate evidence.
-- Apply only after isolated Preview DB/schema identity is verified and existing constraints reviewed.
alter table public.bridge_assets
  add column if not exists original_filename text,
  add column if not exists sha256 text,
  add column if not exists supersedes_asset_id text references public.bridge_assets(id);

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

-- SHA-256 is set only by trusted server-side verification; never trust client hashes.
