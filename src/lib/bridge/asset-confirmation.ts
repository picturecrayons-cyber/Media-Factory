import type { Sql } from "../db.ts";
import { isMissingOrganizationSchemaError } from "./workspace-schema.ts";

/** Persist a verified HeadObject result, title reference and audit event atomically. */
export async function persistVerifiedAsset(sql: Pick<Sql, "query" | "transaction">, opts: {
  assetId: string;
  actorUserId: string;
  internalActor: boolean;
  superAdminActor: boolean;
  titleId: string;
  kind: string;
  byteSize: number;
  contentType: string | null;
  checksum: string | null;
  sourceKey: string;
  sealedKey: string;
}): Promise<boolean> {
  if (!Number.isSafeInteger(opts.byteSize) || opts.byteSize <= 0) throw new Error("Uploaded object is empty");

  // Version allocation is a read-then-write operation. Serialize every
  // confirmation for this title in a transaction, and acquire the lock in a
  // separate statement so READ COMMITTED gets a fresh snapshot for the
  // subsequent MAX(version) query after any competing confirmation commits.
  return sql.transaction(async (tx) => {
    await tx.query(
      "select pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [opts.titleId],
    );

    // Owner and internal confirmation must not reference the optional Studio
    // organization tables. PostgreSQL plans the whole statement, so an unused
    // OR branch still fails when that relation is absent.
    if (await persistVerifiedAssetScoped(tx, opts, false)) return true;
    try {
      return await persistVerifiedAssetScoped(tx, opts, true);
    } catch (error) {
      if (isMissingOrganizationSchemaError(error)) return false;
      throw error;
    }
  });
}

async function persistVerifiedAssetScoped(
  sql: Pick<Sql, "query">,
  opts: {
    assetId: string;
    actorUserId: string;
    internalActor: boolean;
    superAdminActor: boolean;
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
            and (
              (
                $10
                and not exists (
                  select 1 from bridge_loop_publications p
                  where p.bridge_title_id = t.id and p.approved_at is not null
                )
                and not exists (
                  select 1 from bridge_destination_packages dp
                  where dp.title_id = t.id and dp.readiness_state = 'DELIVERED'
                )
                and not exists (
                  select 1 from bridge_delivery_jobs dj
                  where dj.title_id = t.id and dj.admin_sign_off = true
                    and dj.delivery_receipt_url is not null
                    and length(trim(dj.delivery_receipt_url)) > 0
                )
              )
              or (not $10 and t.status in ('DRAFT','UPLOADING','PREPARING'))
            )
            and (
              $10
              or not exists (
                select 1
                from bridge_assets previous
                where previous.title_id = t.id
                  and (
                    previous.kind = a.kind
                    or (a.kind in ('poster', 'poster_vertical') and previous.kind in ('poster', 'poster_vertical'))
                  )
                  and previous.byte_size > 0
                  and previous.id <> a.id
              )
            )
            and (
              $5
              or t.owner_user_id = $4
              ${studioPredicate}
            )
        )
      returning a.id, a.title_id, a.kind, a.s3_key
    ), replaced as (
      select v.title_id, v.kind
      from verified v
      where exists (
        select 1 from bridge_assets previous
        where previous.title_id = v.title_id
          and (
            previous.kind = v.kind
            or (v.kind in ('poster', 'poster_vertical') and previous.kind in ('poster', 'poster_vertical'))
          )
          and previous.byte_size > 0
          and previous.id <> v.id
      )
    ), qc_invalidated as (
      update bridge_qc_cases q
      set status = 'ACTION_REQUIRED', reviewed_by = null, reviewed_at = null
      where q.title_id in (select title_id from replaced)
        and q.status = 'PASSED'
      returning q.title_id
    ), legal_invalidated as (
      update bridge_legal_cases l
      set status = 'ACTION_REQUIRED', reviewed_by = null, reviewed_at = null
      where l.title_id in (select title_id from replaced)
        and l.status = 'APPROVED'
      returning l.title_id
    ), gates_invalidated as (
      update bridge_title_gate_certifications g
      set ott_preparation_status = 'HOLD',
          packaging_status = 'HOLD',
          curation_status = 'HOLD',
          delivery_status = 'HOLD',
          updated_at = now()
      where g.title_id in (select title_id from replaced)
      returning g.title_id
    ), packages_invalidated as (
      update bridge_destination_packages p
      set readiness_state = 'HOLD', authorized_by = null, authorized_at = null
      where p.title_id in (select title_id from replaced)
        and p.readiness_state in ('READY','AUTHORIZED')
      returning p.title_id
    ), versioned as (
      insert into bridge_asset_versions (
        title_id, asset_group, asset_type, version, reference_asset_id,
        s3_key, checksum_sha256, byte_size, processing_state, created_by
      )
      select
        v.title_id,
        case
          when v.kind = 'master' then 'VIDEO'
          when v.kind = 'screener' then 'PROMO'
          when v.kind = 'subtitle' then 'SUBTITLE'
          when v.kind in ('poster','poster_vertical','poster_horizontal','thumbnail') then 'ARTWORK'
          else 'DOCUMENT'
        end,
        case
          when v.kind = 'master' then 'MASTER'
          when v.kind = 'screener' then 'TRAILER'
          when v.kind = 'subtitle' then 'SUBTITLE'
          when v.kind = 'poster' then 'POSTER'
          when v.kind = 'poster_vertical' then 'POSTER_VERTICAL'
          when v.kind = 'poster_horizontal' then 'POSTER_HORIZONTAL'
          when v.kind = 'thumbnail' then 'THUMBNAIL'
          when v.kind = 'censor_certificate' then 'CENSOR_CERTIFICATE'
          else upper(v.kind)
        end,
        coalesce((
          select max(previous.version) + 1
          from bridge_asset_versions previous
          where previous.title_id = v.title_id
            and previous.asset_type = case
              when v.kind = 'master' then 'MASTER'
              when v.kind = 'screener' then 'TRAILER'
              when v.kind = 'subtitle' then 'SUBTITLE'
              when v.kind = 'poster' then 'POSTER'
              when v.kind = 'poster_vertical' then 'POSTER_VERTICAL'
              when v.kind = 'poster_horizontal' then 'POSTER_HORIZONTAL'
              when v.kind = 'thumbnail' then 'THUMBNAIL'
              when v.kind = 'censor_certificate' then 'CENSOR_CERTIFICATE'
              else upper(v.kind)
            end
            and previous.language is null
        ), 1),
        (
          select previous.id
          from bridge_asset_versions previous
          where previous.title_id = v.title_id
            and previous.asset_type = case
              when v.kind = 'master' then 'MASTER'
              when v.kind = 'screener' then 'TRAILER'
              when v.kind = 'subtitle' then 'SUBTITLE'
              when v.kind = 'poster' then 'POSTER'
              when v.kind = 'poster_vertical' then 'POSTER_VERTICAL'
              when v.kind = 'poster_horizontal' then 'POSTER_HORIZONTAL'
              when v.kind = 'thumbnail' then 'THUMBNAIL'
              when v.kind = 'censor_certificate' then 'CENSOR_CERTIFICATE'
              else upper(v.kind)
            end
            and previous.language is null
          order by previous.version desc limit 1
        ),
        v.s3_key, $9::text, $1, 'PROCESSING', $4
      from verified v
      returning id, title_id, asset_type, version, s3_key
    ), title_set as (
      update bridge_titles t set
        poster_key = case when v.asset_type in ('POSTER', 'POSTER_VERTICAL') then v.s3_key else t.poster_key end,
        master_key = case when v.asset_type = 'MASTER' then v.s3_key else t.master_key end,
        updated_at = now()
      from versioned v where t.id = v.title_id returning t.id
    )
    insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    select $4, 'asset.upload_verified', 'bridge_asset', a.id,
      jsonb_build_object(
        'titleId', a.title_id,
        'kind', a.kind,
        'byteSize', $1,
        'checksum', $9::text,
        'assetVersionId', ver.id,
        'assetVersion', ver.version
      )
    from verified a
    join versioned ver on ver.title_id = a.title_id and ver.s3_key = a.s3_key
    join title_set t on t.id = a.title_id
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
    opts.superAdminActor,
  ]);
  return Boolean(rows[0]);
}
