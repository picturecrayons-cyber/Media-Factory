import type { Sql } from "../db.ts";

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
}): Promise<boolean> {
  if (!Number.isSafeInteger(opts.byteSize) || opts.byteSize <= 0) throw new Error("Uploaded object is empty");
  const rows = await sql.query<{ entity_id: string }>(`
    with verified as (
      update bridge_assets a set byte_size = $1, content_type = coalesce($2, a.content_type)
      where a.id = $3 and a.created_by = $4 and a.byte_size is null
        and exists (select 1 from bridge_titles t where t.id = a.title_id
          and ($5 or t.owner_user_id = $4) and t.status in ('DRAFT','UPLOADING','PREPARING'))
      returning a.id, a.title_id, a.kind, a.s3_key
    ), title_set as (
      update bridge_titles t set
        poster_key = case when v.kind = 'poster' then v.s3_key else t.poster_key end,
        master_key = case when v.kind = 'master' then v.s3_key else t.master_key end,
        updated_at = now()
      from verified v where t.id = v.title_id returning t.id
    )
    insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    select $4, 'asset.upload_verified', 'bridge_asset', v.id, $6
    from verified v join title_set t on t.id = v.title_id
    returning entity_id
  `, [
    opts.byteSize,
    opts.contentType,
    opts.assetId,
    opts.actorUserId,
    opts.internalActor,
    JSON.stringify({
      titleId: opts.titleId,
      kind: opts.kind,
      byteSize: opts.byteSize,
      checksum: opts.checksum,
    }),
  ]);
  return Boolean(rows[0]);
}
