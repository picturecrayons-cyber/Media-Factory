-- Keep the Production register in sync with verified Bridge source assets.
-- Legacy title pointers are deliberately excluded and remain untouched.
create unique index if not exists bridge_production_assets_source_asset_unique_idx
  on public.bridge_production_assets (title_id, (tags->>'source_asset_id'))
  where tags->>'source_table' = 'bridge_assets'
    and tags->>'link_type' = 'metadata_reference'
    and nullif(tags->>'source_asset_id', '') is not null;

-- Backfill existing verified objects into the Production register.
-- This creates metadata references only: it never copies or moves OCI objects,
-- changes title lifecycle state, or creates QC/legal/rights/publication approvals.
insert into public.bridge_production_assets (
  title_id,
  category,
  file_name,
  file_path,
  file_size,
  content_type,
  tags
)
select
  a.title_id,
  case
    when a.kind in ('master', 'screener') then 'raw_video'
    when a.kind in ('poster', 'poster_vertical', 'poster_horizontal', 'thumbnail') then 'stills'
    when a.kind in ('subtitle', 'technical', 'censor_certificate') then 'documents'
    else null
  end,
  regexp_replace(split_part(a.s3_key, '.verified/', 1), '^.*/', ''),
  a.s3_key,
  a.byte_size,
  a.content_type,
  jsonb_build_object(
    'link_type', 'metadata_reference',
    'source_table', 'bridge_assets',
    'source_asset_id', a.id,
    'source_kind', a.kind,
    'verified_source', true,
    'storage_tier', a.storage_tier,
    'storage_business_state', a.storage_business_state,
    'restore_state', a.restore_state
  )
from public.bridge_assets a
where a.byte_size > 0
  and a.storage_business_state = 'ACTIVE'
  and a.restore_state = 'READY'
  and a.kind in (
    'master', 'screener',
    'poster', 'poster_vertical', 'poster_horizontal', 'thumbnail',
    'subtitle', 'technical', 'censor_certificate'
  )
on conflict (title_id, (tags->>'source_asset_id'))
  where tags->>'source_table' = 'bridge_assets'
    and tags->>'link_type' = 'metadata_reference'
    and nullif(tags->>'source_asset_id', '') is not null
do update set
  category = excluded.category,
  file_name = excluded.file_name,
  file_path = excluded.file_path,
  file_size = excluded.file_size,
  content_type = excluded.content_type,
  tags = bridge_production_assets.tags || excluded.tags,
  updated_at = now();
