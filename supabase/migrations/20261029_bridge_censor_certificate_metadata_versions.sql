-- Additive metadata for censor-certificate evidence. Never delete or merge existing records.
-- Apply only after isolated Preview database and schema identity have been verified.
alter table public.bridge_assets
  add column if not exists original_filename text,
  add column if not exists sha256 text,
  add column if not exists supersedes_asset_id text references public.bridge_assets(id);

alter table public.bridge_assets
  add constraint bridge_assets_sha256_format_chk
  check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

create index if not exists bridge_assets_certificate_fingerprint_idx
  on public.bridge_assets (title_id, kind, sha256)
  where kind = 'censor_certificate' and sha256 is not null;

create index if not exists bridge_assets_certificate_versions_idx
  on public.bridge_assets (title_id, created_at desc)
  where kind = 'censor_certificate';

-- SHA-256 must be independently verified server-side; never trust a client hash alone.
