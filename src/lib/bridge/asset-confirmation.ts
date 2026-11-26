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
  sha256: string;
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
    sha256: string;
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
      update bridge_assets a set byte_size = $1, content_type = coalesce($2, a.content_type), s3_key = $6, sha256 = $10, checksum_sha256 = $10
      where a.id = $3 and a.created_by = $4 and a.s3_key = $7
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
            -- Do not let an older asset confirmation replace a newer title
            -- master/poster pointer. Only reconcile the raw source or the
            -- exact sealed key derived from that same source.
            and (
              (a.kind in ('poster', 'poster_vertical')
                and (
                  t.poster_key is null or t.poster_key = $7 or t.poster_key = $6
                  -- Allow a newer upload to replace a pointer owned by an older
                  -- asset. An older retry cannot move the pointer backwards.
                  or exists (
                    select 1 from bridge_assets previous
                    where previous.title_id = t.id
                      and previous.kind in ('poster', 'poster_vertical')
                      and previous.s3_key = t.poster_key
                      and (a.created_at, a.id) > (previous.created_at, previous.id)
                  )
                ))
              or (a.kind = 'master'
                and (
                  t.master_key is null or t.master_key = $7 or t.master_key = $6
                  or exists (
                    select 1 from bridge_assets previous
                    where previous.title_id = t.id
                      and previous.kind = 'master'
                      and previous.s3_key = t.master_key
                      and (a.created_at, a.id) > (previous.created_at, previous.id)
                  )
                ))
              or a.kind not in ('master', 'poster', 'poster_vertical')
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
        'checksum', $9::text,
        'sha256', $10::text
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
    opts.sha256,
  ]);
  return Boolean(rows[0]);
}
