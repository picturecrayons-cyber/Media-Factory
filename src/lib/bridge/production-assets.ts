import type { Sql } from "../db.ts";

type ProductionAssetSource = {
  assetId: string;
  titleId: string;
};

/**
 * Adds or refreshes the metadata-only Production register entry for an already
 * verified Bridge asset. The source asset remains in its original OCI location;
 * no file is copied and no object key is returned to the browser.
 *
 * The partial unique index is installed by
 * 20261121190000_bridge_production_asset_source_sync.sql.
 */
export async function syncVerifiedProductionAsset(
  sql: Pick<Sql, "query">,
  source: ProductionAssetSource,
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `
      insert into bridge_production_assets (
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
      from bridge_assets a
      where a.id = $1
        and a.title_id = $2
        and a.byte_size > 0
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
        updated_at = now()
      returning id
    `,
    [source.assetId, source.titleId],
  );

  return rows.length > 0;
}
