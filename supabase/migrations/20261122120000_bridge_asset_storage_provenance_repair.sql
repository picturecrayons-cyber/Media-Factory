-- Restore the canonical OCI asset provenance columns expected by the
-- asset-confirmation writer. Additive and idempotent; no existing asset rows
-- are rewritten and no RLS, grants, or policies are changed.
alter table public.bridge_assets
  add column if not exists sha256 text,
  add column if not exists asset_version_id uuid,
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

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bridge_assets'::regclass
      and conname = 'bridge_assets_asset_version_id_fkey'
  ) then
    alter table public.bridge_assets
      add constraint bridge_assets_asset_version_id_fkey
      foreign key (asset_version_id)
      references public.bridge_asset_versions(id)
      on delete set null;
  end if;
end
$migration$;

create index if not exists bridge_assets_asset_version_id_idx
  on public.bridge_assets(asset_version_id);
