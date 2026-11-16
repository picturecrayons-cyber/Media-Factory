-- Immutable asset replacement metadata and version lineage.
-- No existing asset keys are modified or removed by this migration.
alter table public.bridge_assets
  add column if not exists supersedes_asset_id text
    references public.bridge_assets(id) on delete restrict,
  add column if not exists replaced_by_asset_id text
    references public.bridge_assets(id) on delete restrict,
  add column if not exists superseded_at timestamptz,
  add column if not exists replacement_reason text,
  add column if not exists replacement_initiated_by text;

create index if not exists bridge_assets_supersedes_idx
  on public.bridge_assets (supersedes_asset_id)
  where supersedes_asset_id is not null;

create index if not exists bridge_assets_active_title_kind_idx
  on public.bridge_assets (title_id, kind, created_at desc)
  where byte_size is not null and superseded_at is null;

comment on column public.bridge_assets.supersedes_asset_id is
  'Previous verified Bridge asset row replaced by this immutable asset version; the prior object is retained.';
comment on column public.bridge_assets.replaced_by_asset_id is
  'New verified Bridge asset row replacing this historical asset; prior object is retained.';
comment on column public.bridge_assets.superseded_at is
  'Timestamp when this verified asset stopped being the active version. No object deletion is implied.';
