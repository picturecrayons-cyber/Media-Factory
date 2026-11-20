import type { Sql } from "../db.ts";
import { isMissingOrganizationSchemaError } from "./workspace-schema.ts";

/** Persist a verified HeadObject result, title reference and audit event atomically. */
export async function persistVerifiedAsset(sql: Pick<Sql, "query">, opts: {
  assetId: string;
  actorUserId: string;
  internalActor: boolean;
  titleId: string;
  kind: string;
  byteSize: number;
  contentType: string | null;
  checksum: string | null;
  sourceKey: string;
  sealedKey: string;
}): Promise<boolean> {
  if (!Number.isSafeInteger(opts.byteSize) || opts.byteSize <= 0) throw new Error("Uploaded object is empty");
  // Owner and internal confirmation must not reference the optional Studio
  // organization tables. Production can persist a verified asset before
  // migration 0021 is applied. PostgreSQL plans the whole statement, so an
  // unused OR branch still fails when that relation is absent.
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
  opts: {
    assetId: string;
    actorUserId: string;
    internalActor: boolean;
    titleId: string;
    kind: string;
    byteSize: number;
    contentType: string | null;
    checksum: string | null;
    sourceKey: string;
    sealedKey: string;
  },
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
    with verified as (
      update bridge_assets a set byte_size = $1, content_type = coalesce($2, a.content_type), s3_key = $6
      where a.id = $3 and a.created_by = $4 and a.byte_size is null and a.s3_key = $7
        and a.title_id = $8
        and exists (
          select 1
          from bridge_titles t
          where t.id = a.title_id
            and t.status in ('DRAFT','UPLOADING','PREPARING')
            and (
              $5
              or t.owner_user_id = $4
              ${studioPredicate}
            )
        )
      returning a.id, a.title_id, a.kind, a.s3_key
    ), title_set as (
      update bridge_titles t set
        poster_key = case when v.kind in ('poster', 'poster_vertical') then v.s3_key else t.poster_key end,
        master_key = case when v.kind = 'master' then v.s3_key else t.master_key end,
        updated_at = now()
      from verified v where t.id = v.title_id returning t.id
    )
    insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    select $4, 'asset.upload_verified', 'bridge_asset', v.id,
      jsonb_build_object(
        'titleId', v.title_id,
        'kind', v.kind,
        'byteSize', $1,
        'checksum', $9::text
      )
    from verified v join title_set t on t.id = v.title_id
    returning entity_id
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
  ]);
  return Boolean(rows[0]);
}


/**
 * Atomically activate a Super Admin replacement after the new OCI object has
 * been sealed and verified. The previous asset row and object are retained.
 */
export async function persistVerifiedAssetReplacement(
  sql: Sql,
  opts: {
    assetId: string;
    previousAssetId: string;
    actorUserId: string;
    titleId: string;
    kind: string;
    byteSize: number;
    contentType: string | null;
    etag: string;
    sourceKey: string;
    sealedKey: string;
    reason: string;
  },
): Promise<boolean> {
  if (!Number.isSafeInteger(opts.byteSize) || opts.byteSize <= 0)
    throw new Error("Uploaded replacement object is empty");
  if (opts.reason.trim().length < 8)
    throw new Error("A replacement reason of at least 8 characters is required");

  const rows = await sql.transaction(async (tx) => tx.query<{ entity_id: string }>(
    `
    with lock as materialized (
      select pg_advisory_xact_lock(hashtextextended($1, 0))
    ), title_lock as materialized (
      select b.id, b.status, b.master_key, b.poster_key
      from bridge_titles b cross join lock
      where b.id = $2
      for update
    ), old_asset as materialized (
      select a.id, a.title_id, a.kind, a.s3_key
      from bridge_assets a
      join title_lock t on t.id = a.title_id
      where a.id = $3
        and a.byte_size > 0
        and a.superseded_at is null
        and a.kind = $4
        and (a.kind <> 'master' or t.master_key = a.s3_key)
        and (a.kind not in ('poster','poster_vertical') or t.poster_key = a.s3_key)
      for update
    ), new_asset as (
      update bridge_assets n
      set byte_size = $5,
          content_type = coalesce($6, n.content_type),
          s3_key = $7
      from old_asset o, title_lock t
      where n.id = $8
        and n.title_id = o.title_id
        and n.kind = o.kind
        and n.created_by = $9
        and n.byte_size is null
        and n.s3_key = $10
        and n.supersedes_asset_id = o.id
        and n.replacement_initiated_by = $9
        and n.replacement_reason = $11
      returning n.id, n.title_id, n.kind, n.s3_key
    ), retired as (
      update bridge_assets o
      set superseded_at = now(),
          replaced_by_asset_id = n.id
      from new_asset n, old_asset old
      where o.id = old.id
      returning o.id
    ), pointer_update as (
      update bridge_titles t
      set master_key = case when n.kind = 'master' then n.s3_key else t.master_key end,
          poster_key = case when n.kind in ('poster','poster_vertical') then n.s3_key else t.poster_key end,
          updated_at = now()
      from new_asset n
      where t.id = n.title_id
      returning t.id, t.master_key, t.poster_key
    ), qc_reopened as (
      insert into bridge_qc_cases (title_id, status, automated_findings, reviewer_findings)
      select p.id, 'PENDING',
        jsonb_build_array(jsonb_build_object(
          'type','ASSET_REPLACEMENT',
          'assetId',n.id,
          'previousAssetId',old.id,
          'kind',n.kind,
          'reason',$11::text
        )),
        jsonb_build_array(jsonb_build_object(
          'masterKey',p.master_key,
          'posterKey',p.poster_key,
          'requiresFreshReview',true
        ))
      from pointer_update p
      join new_asset n on n.title_id=p.id
      join old_asset old on true
      returning id
    )
    insert into bridge_audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    select $9, 'asset.replaced', 'bridge_asset', n.id,
      jsonb_build_object(
        'titleId', n.title_id,
        'kind', n.kind,
        'oldAssetId', old.id,
        'newAssetId', n.id,
        'reason', $11::text,
        'byteSize', $5,
        'etag', $12::text,
        'qcCaseId', (select id from qc_reopened limit 1)
      )::text
    from new_asset n
    join old_asset old on true
    where exists(select 1 from retired)
    returning entity_id
    `,
    [
      `bridge-asset-replacement:${opts.titleId}:${opts.kind}`,
      opts.titleId,
      opts.previousAssetId,
      opts.kind,
      opts.byteSize,
      opts.contentType,
      opts.sealedKey,
      opts.assetId,
      opts.actorUserId,
      opts.sourceKey,
      opts.reason.trim(),
      opts.etag,
    ],
  ));
  return Boolean(rows[0]);
}
