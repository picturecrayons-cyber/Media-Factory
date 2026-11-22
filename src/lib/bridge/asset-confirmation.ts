import type { Sql } from "../db.ts";
import { isMissingOrganizationSchemaError } from "./workspace-schema.ts";

type VerifiedAssetOptions = {
  assetId: string;
  actorUserId: string;
  internalActor: boolean;
  titleId: string;
  kind: string;
  byteSize: number;
  contentType: string | null;
  checksum: string;
  etag: string | null;
  sourceKey: string;
  sealedKey: string;
  storageBucket: string;
  storageNamespace: string;
  storageRegion: string;
  storageEndpoint: string;
};

/**
 * Persist the canonical asset version, sealed asset pointer, title pointer,
 * storage provenance and audit record in one Postgres statement/transaction.
 *
 * A populated byte_size is never sufficient evidence: existing rows are only
 * repairable when the observed size and current key still match this exact
 * source/sealed pair, and an existing version pointer must match the same
 * SHA-256, size and immutable object key.
 */
export async function persistVerifiedAsset(
  sql: Pick<Sql, "query">,
  opts: VerifiedAssetOptions,
): Promise<boolean> {
  if (!Number.isSafeInteger(opts.byteSize) || opts.byteSize <= 0) {
    throw new Error("Uploaded object is empty");
  }
  if (!/^[a-f0-9]{64}$/i.test(opts.checksum)) {
    throw new Error("A verified SHA-256 checksum is required");
  }
  if (!opts.storageBucket || !opts.storageNamespace || !opts.storageRegion || !opts.storageEndpoint) {
    throw new Error("Complete OCI storage provenance is required");
  }

  // Keep the owner/internal path independent of optional Studio schema.
  if (await persistVerifiedAssetScoped(sql, opts, false)) return true;
  try {
    return await persistVerifiedAssetScoped(sql, opts, true);
  } catch (error) {
    if (isMissingOrganizationSchemaError(error)) return false;
    throw error;
  }
}

async function persistVerifiedAssetScoped(
  sql: Pick<Sql, "query">,
  opts: VerifiedAssetOptions,
  studioScope: boolean,
): Promise<boolean> {
  const studioPredicate = studioScope ? `
        or (
          t.owner_account_type = 'studio'
          and exists (
            select 1
            from bridge_profiles p
            join bridge_organization_memberships m
              on m.user_id = p.user_id
             and m.status = 'active'
            join bridge_organizations o
              on o.id = m.organization_id
             and o.status = 'active'
            where p.user_id = $4
              and p.account_type = 'studio'
              and p.email_verified = true
              and t.owner_organization_id = m.organization_id
          )
        )` : "";

  const rows = await sql.query<{ entity_id: string }>(`
    with eligible as materialized (
      select
        a.id,
        a.title_id,
        a.kind,
        a.asset_version_id,
        case
          when a.kind = 'master' then coalesce(t.original_language, t.language)
          when a.kind = 'subtitle' then coalesce(t.original_language, t.language)
          else null
        end as version_language
      from bridge_assets a
      join bridge_titles t on t.id = a.title_id
      where a.id = $3
        and a.created_by = $4
        and a.title_id = $8
        and (a.byte_size is null or (a.byte_size = $1 and a.s3_key in ($6, $7)))
        and t.status in ('DRAFT', 'UPLOADING', 'PREPARING')
        and (
          $5
          or t.owner_user_id = $4
          ${studioPredicate}
        )
      for update of a, t
    ),
    version_created as (
      insert into bridge_asset_versions (
        title_id, asset_group, asset_type, version, language,
        s3_key, checksum_sha256, byte_size, technical_metadata,
        processing_state, created_by
      )
      select
        e.title_id,
        case
          when e.kind = 'master' then 'VIDEO'
          when e.kind = 'audio' then 'AUDIO'
          when e.kind = 'subtitle' then 'SUBTITLE'
          when e.kind in ('poster', 'poster_vertical', 'poster_horizontal', 'thumbnail') then 'ARTWORK'
          when e.kind = 'screener' then 'PROMO'
          else 'DOCUMENT'
        end,
        e.kind,
        coalesce((
          select max(v.version)
          from bridge_asset_versions v
          where v.title_id = e.title_id
            and v.asset_type = e.kind
            and v.language is not distinct from e.version_language
        ), 0) + 1,
        e.version_language,
        $6,
        $9,
        $1,
        jsonb_build_object(
          'verifiedObjectKey', $6,
          'sourceObjectKey', $7,
          'storageProvider', 'OCI',
          'storageBucket', $11,
          'storageNamespace', $12,
          'storageRegion', $13,
          'storageEndpoint', $14,
          'storageVerifiedAt', now(),
          'sha256', $9,
          'etag', $10
        ),
        'PASSED',
        $4
      from eligible e
      where e.asset_version_id is null
      returning id, title_id, asset_type, s3_key, checksum_sha256, byte_size, processing_state
    ),
    candidate_version as (
      select id, title_id, asset_type, s3_key, checksum_sha256, byte_size, processing_state
      from version_created
      union all
      select v.id, v.title_id, v.asset_type, v.s3_key, v.checksum_sha256, v.byte_size, v.processing_state
      from eligible e
      join bridge_asset_versions v on v.id = e.asset_version_id
      where v.title_id = e.title_id
        and v.asset_type = e.kind
        and v.s3_key = $6
        and v.checksum_sha256 = $9
        and v.byte_size = $1
        and v.processing_state = 'PASSED'
    ),
    verified as (
      update bridge_assets a
      set
        byte_size = $1,
        content_type = coalesce($2, a.content_type),
        s3_key = $6,
        sha256 = $9,
        checksum_sha256 = $9,
        source_object_key = $7,
        verified_object_key = $6,
        storage_provider = 'OCI',
        storage_bucket = $11,
        storage_namespace = $12,
        storage_region = $13,
        storage_endpoint = $14,
        storage_verified_at = now(),
        asset_version_id = v.id
      from eligible e
      join candidate_version v
        on v.title_id = e.title_id
       and v.asset_type = e.kind
       and v.s3_key = $6
       and v.checksum_sha256 = $9
       and v.byte_size = $1
       and v.processing_state = 'PASSED'
      where a.id = e.id
        and (a.asset_version_id is null or a.asset_version_id = v.id)
        and (
          a.asset_version_id is distinct from v.id
          or a.byte_size is distinct from $1
          or a.s3_key is distinct from $6
          or a.checksum_sha256 is distinct from $9
          or a.storage_verified_at is null
        )
      returning a.id, a.title_id, a.kind, a.s3_key, v.id as asset_version_id
    ),
    already_verified as (
      select a.id, a.title_id, a.kind, a.s3_key, v.id as asset_version_id
      from eligible e
      join candidate_version v
        on v.title_id = e.title_id
       and v.asset_type = e.kind
       and v.s3_key = $6
       and v.checksum_sha256 = $9
       and v.byte_size = $1
       and v.processing_state = 'PASSED'
      join bridge_assets a
        on a.id = e.id
       and a.asset_version_id = v.id
       and a.byte_size = $1
       and a.s3_key = $6
       and a.checksum_sha256 = $9
       and a.source_object_key = $7
       and a.verified_object_key = $6
       and a.storage_provider = 'OCI'
       and a.storage_bucket = $11
       and a.storage_namespace = $12
       and a.storage_region = $13
       and a.storage_endpoint = $14
       and a.storage_verified_at is not null
    ),
    persisted as (
      select id, title_id, kind, s3_key, asset_version_id from verified
      union all
      select id, title_id, kind, s3_key, asset_version_id
      from already_verified a
      where not exists (select 1 from verified v where v.id = a.id)
    ),
    title_set as (
      update bridge_titles t
      set
        poster_key = case when v.kind in ('poster', 'poster_vertical') then v.s3_key else t.poster_key end,
        master_key = case when v.kind = 'master' then v.s3_key else t.master_key end,
        updated_at = now()
      from persisted v
      where t.id = v.title_id
      returning t.id
    ),
    audit as (
      insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      select $4, 'asset.upload_verified', 'bridge_asset', v.id,
        jsonb_build_object(
          'titleId', v.title_id,
          'kind', v.kind,
          'assetVersionId', v.asset_version_id,
          'byteSize', $1,
          'checksumSha256', $9,
          'etag', $10,
          'sourceObjectKey', $7,
          'verifiedObjectKey', $6,
          'storageProvider', 'OCI',
          'storageBucket', $11,
          'storageNamespace', $12,
          'storageRegion', $13,
          'storageEndpoint', $14
        )
      from verified v
      join title_set t on t.id = v.title_id
      returning entity_id
    )
    select entity_id from audit
    union all
    select a.id as entity_id
    from already_verified a
    where not exists (select 1 from verified v where v.id = a.id)
  `, [
    opts.byteSize,
    opts.contentType,
    opts.assetId,
    opts.actorUserId,
    opts.internalActor,
    opts.sealedKey,
    opts.sourceKey,
    opts.titleId,
    opts.checksum,
    opts.etag,
    opts.storageBucket,
    opts.storageNamespace,
    opts.storageRegion,
    opts.storageEndpoint,
  ]);
  return Boolean(rows[0]);
}
