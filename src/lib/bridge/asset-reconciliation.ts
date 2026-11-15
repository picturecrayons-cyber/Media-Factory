import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

const MIGRATION_KIND: Record<string, "master" | "poster" | "screener"> = {
  MASTER: "master",
  POSTER: "poster",
  TRAILER: "screener",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingObject(error: unknown) {
  return /OCI object verification failed \(404\)/i.test(errorMessage(error));
}

export const reconcileProductionAssets = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      limit: z.number().int().min(1).max(1).default(1),
      queueAfterId: z.string().regex(/^[0-9]+$/).default("0"),
      assetAfterId: z.string().max(128).default(""),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access is required");
    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("Asset reconciliation can only run on the Production deployment");
    }

    const { verifyObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    const sql = await getSql();
    const summary = {
      queueScanned: 0,
      legacyAssetsLinked: 0,
      existingAssetsScanned: 0,
      existingAssetsVerified: 0,
      missingInOci: 0,
      failed: 0,
      errors: [] as string[],
    };

    let nextQueueAfterId = data.queueAfterId;
    let nextAssetAfterId = data.assetAfterId;

    // First reconcile legacy migration targets that already exist in OCI.
    // AWS source keys are never treated as OCI paths and are never copied by this action.
    const queueRows = await sql<{
      id: string;
      title_id: string;
      title_name: string;
      asset_kind: string;
      source_key: string | null;
      target_path: string;
    }>`
      select q.id::text as id, q.title_id, t.name as title_name,
             q.asset_kind, q.source_key, q.target_path
      from loop_media_migration_queue q
      join bridge_titles t on t.id = q.title_id
      where q.id > ${data.queueAfterId}::bigint
        and q.status in ('PENDING_REUPLOAD', 'MISSING_SOURCE_MEDIA', 'UPLOADED')
        and q.target_provider = 'oci_object_storage'
        and q.target_path is not null
        and t.status in ('DRAFT', 'UPLOADING', 'PREPARING')
        and t.merged_into_title_id is null
        and lower(t.name) not like 'test%'
        and lower(t.name) not like '%internal test%'
        and q.asset_kind in ('MASTER', 'POSTER', 'TRAILER')
        and not exists (
          select 1 from bridge_assets a
          where a.title_id = q.title_id and a.s3_key = q.target_path
        )
      order by q.id asc
      limit ${data.limit}
    `;

    for (const row of queueRows) {
      try {
        summary.queueScanned += 1;
        const kind = MIGRATION_KIND[row.asset_kind];
        if (!kind) {
          nextQueueAfterId = row.id;
          continue;
        }
        const source = await verifyObject(row.target_path);
        if (!Number.isSafeInteger(source.byteSize) || source.byteSize <= 0 || !source.etag) {
          throw new Error("OCI target did not return a positive size and ETag");
        }
        const assetId = randomBytes(16).toString("hex");
        const sealedKey = `${row.target_path}.verified/${assetId}`;
        const sealed = await sealVerifiedObject(row.target_path, sealedKey, source.etag);
        if (
          !Number.isSafeInteger(sealed.byteSize) ||
          sealed.byteSize <= 0 ||
          sealed.byteSize !== source.byteSize ||
          !sealed.etag
        ) {
          throw new Error("Immutable OCI copy did not pass size and ETag verification");
        }

        const linked = await sql.transaction(async (tx) => {
          const [lockedQueue] = await tx<{ id: string }>`
            select id from loop_media_migration_queue
            where id = ${row.id}::bigint
              and status in ('PENDING_REUPLOAD', 'MISSING_SOURCE_MEDIA', 'UPLOADED')
            for update
          `;
          if (!lockedQueue) return false;
          const [lockedTitle] = await tx<{ id: string }>`
            select id from bridge_titles
            where id = ${row.title_id}
              and status in ('DRAFT', 'UPLOADING', 'PREPARING')
              and merged_into_title_id is null
            for update
          `;
          if (!lockedTitle) return false;
          const inserted = await tx<{ id: string }>`
            insert into bridge_assets (
              id, title_id, kind, s3_key, content_type, byte_size, created_by
            )
            select
              ${assetId}, t.id, ${kind}, ${sealedKey},
              ${sealed.contentType}, ${sealed.byteSize}, t.owner_user_id
            from bridge_titles t
            where t.id = ${row.title_id}
              and t.status in ('DRAFT', 'UPLOADING', 'PREPARING')
              and t.merged_into_title_id is null
              and not exists (
                select 1 from bridge_assets a
                where a.title_id = t.id
                  and (
                    a.s3_key = ${row.target_path}
                    or position(${row.target_path} || '.verified/' in a.s3_key) = 1
                  )
              )
            returning id
          `;
          if (!inserted[0]) return false;

          await tx`
            update bridge_titles t set
              poster_key = case
                when ${kind} = 'poster'
                  and (
                    t.poster_key = ${row.source_key}
                    or t.poster_key = ${row.target_path}
                    or (
                      t.poster_key is null
                      and (
                        select count(*) from loop_media_migration_queue q2
                        where q2.title_id = t.id
                          and q2.asset_kind = 'POSTER'
                          and q2.status in ('PENDING_REUPLOAD', 'MISSING_SOURCE_MEDIA', 'UPLOADED')
                      ) = 1
                    )
                  ) then ${sealedKey}
                else t.poster_key
              end,
              master_key = case
                when ${kind} = 'master'
                  and (
                    t.master_key = ${row.source_key}
                    or t.master_key = ${row.target_path}
                    or (
                      t.master_key is null
                      and (
                        select count(*) from loop_media_migration_queue q2
                        where q2.title_id = t.id
                          and q2.asset_kind = 'MASTER'
                          and q2.status in ('PENDING_REUPLOAD', 'MISSING_SOURCE_MEDIA', 'UPLOADED')
                      ) = 1
                    )
                  ) then ${sealedKey}
                else t.master_key
              end,
              updated_at = now()
            where t.id = ${row.title_id}
              and t.status in ('DRAFT', 'UPLOADING', 'PREPARING')
              and t.merged_into_title_id is null
          `;

          await tx`
            update loop_media_migration_queue
            set status = 'VERIFIED', target_path = ${sealedKey}, updated_at = now()
            where id = ${row.id}::bigint
              and status in ('PENDING_REUPLOAD', 'MISSING_SOURCE_MEDIA', 'UPLOADED')
          `;

          await writeAudit(
            {
              actorUserId: actor.userId,
              action: "asset.legacy_reconciled",
              entityType: "bridge_asset",
              entityId: assetId,
              metadata: {
                titleId: row.title_id,
                titleName: row.title_name,
                kind,
                queueId: row.id,
                byteSize: sealed.byteSize,
                immutableOciCopyVerified: true,
              },
            },
            tx,
          );
          return true;
        });
        if (linked) summary.legacyAssetsLinked += 1;
        nextQueueAfterId = row.id;
      } catch (error) {
        if (isMissingObject(error)) {
          summary.missingInOci += 1;
          nextQueueAfterId = row.id;
          continue;
        }
        summary.failed += 1;
        summary.errors.push(`${row.title_name} / ${row.asset_kind}: ${errorMessage(error)}`);
        break;
      }
    }

    // Then verify unconfirmed asset rows already associated with a production title.
    // A successful HEAD is not enough: the object is copied to an immutable key and
    // the database pointer, byte size and audit record are changed atomically.
    if (queueRows.length === 0) {
      const assetRows = await sql<{
        id: string;
        title_id: string;
        title_name: string;
        kind: string;
        source_key: string | null;
        s3_key: string;
        content_type: string | null;
      }>`
        select a.id, a.title_id, t.name as title_name, a.kind,
               a.s3_key, a.content_type,
               (
                 select q.source_key
                 from loop_media_migration_queue q
                 where q.title_id = a.title_id
                   and q.target_path = a.s3_key
                   and q.target_provider = 'oci_object_storage'
                   and q.asset_kind = case
                     when a.kind = 'screener' then 'TRAILER'
                     when a.kind in ('poster', 'poster_vertical', 'poster_horizontal', 'thumbnail') then 'POSTER'
                     else upper(a.kind)
                   end
                 order by q.id desc
                 limit 1
               ) as source_key
        from bridge_assets a
        join bridge_titles t on t.id = a.title_id
        where a.id > ${data.assetAfterId}
          and a.byte_size is null
          and a.s3_key is not null
          and t.status in ('DRAFT', 'UPLOADING', 'PREPARING')
          and t.merged_into_title_id is null
          and lower(t.name) not like 'test%'
          and lower(t.name) not like '%internal test%'
        order by a.id asc
        limit ${data.limit}
      `;

      for (const row of assetRows) {
        try {
          summary.existingAssetsScanned += 1;
          const source = await verifyObject(row.s3_key, row.content_type);
          if (!Number.isSafeInteger(source.byteSize) || source.byteSize <= 0 || !source.etag) {
            throw new Error("OCI object did not return a positive size and ETag");
          }
          const sealedKey = `${row.s3_key}.verified/${row.id}`;
          const sealed = await sealVerifiedObject(row.s3_key, sealedKey, source.etag);
          if (
            !Number.isSafeInteger(sealed.byteSize) ||
            sealed.byteSize <= 0 ||
            sealed.byteSize !== source.byteSize ||
            !sealed.etag
          ) {
            throw new Error("Immutable OCI copy did not pass size and ETag verification");
          }

          const verified = await sql.transaction(async (tx) => {
            const [lockedTitle] = await tx<{ id: string }>`
              select id from bridge_titles
              where id = ${row.title_id}
                and status in ('DRAFT', 'UPLOADING', 'PREPARING')
                and merged_into_title_id is null
              for update
            `;
            if (!lockedTitle) return false;
            const updated = await tx<{ id: string }>`
              update bridge_assets
              set byte_size = ${sealed.byteSize},
                  content_type = coalesce(${sealed.contentType}, content_type),
                  s3_key = ${sealedKey}
              where id = ${row.id}
                and title_id = ${row.title_id}
                and s3_key = ${row.s3_key}
                and byte_size is null
              returning id
            `;
            if (!updated[0]) return false;

            await tx`
              update bridge_titles t set
                poster_key = case
                  when ${row.kind} in ('poster', 'poster_vertical', 'poster_horizontal', 'thumbnail')
                    and (t.poster_key = ${row.s3_key} or t.poster_key = ${row.source_key}) then ${sealedKey}
                  when ${row.kind} in ('poster', 'poster_vertical', 'poster_horizontal', 'thumbnail')
                    and t.poster_key is null
                    and (
                      select count(*) from bridge_assets p
                      where p.title_id = t.id
                        and p.kind in ('poster', 'poster_vertical')
                        and p.byte_size > 0
                    ) = 1 then ${sealedKey}
                  else t.poster_key
                end,
                master_key = case
                  when ${row.kind} = 'master'
                    and (t.master_key = ${row.s3_key} or t.master_key = ${row.source_key}) then ${sealedKey}
                  when ${row.kind} = 'master' and t.master_key is null
                    and (
                      select count(*) from bridge_assets m
                      where m.title_id = t.id and m.kind = 'master' and m.byte_size > 0
                    ) = 1 then ${sealedKey}
                  else t.master_key
                end,
                updated_at = now()
              where t.id = ${row.title_id}
                and t.status in ('DRAFT', 'UPLOADING', 'PREPARING')
                and t.merged_into_title_id is null
            `;

            const queueKind =
              row.kind === "screener"
                ? "TRAILER"
                : row.kind === "poster" || row.kind === "poster_vertical"
                  ? "POSTER"
                  : row.kind.toUpperCase();
            await tx`
              update loop_media_migration_queue
              set status = 'VERIFIED', target_path = ${sealedKey}, updated_at = now()
              where title_id = ${row.title_id}
                and asset_kind = ${queueKind}
                and target_path = ${row.s3_key}
                and status in ('PENDING_REUPLOAD', 'UPLOADED')
            `;

            await writeAudit(
              {
                actorUserId: actor.userId,
                action: "asset.existing_asset_verified",
                entityType: "bridge_asset",
                entityId: row.id,
                metadata: {
                  titleId: row.title_id,
                  titleName: row.title_name,
                  kind: row.kind,
                  byteSize: sealed.byteSize,
                  immutableOciCopyVerified: true,
                },
              },
              tx,
            );
            return true;
          });
          if (verified) summary.existingAssetsVerified += 1;
          nextAssetAfterId = row.id;
        } catch (error) {
          if (isMissingObject(error)) {
            summary.missingInOci += 1;
            nextAssetAfterId = row.id;
            continue;
          }
          summary.failed += 1;
          summary.errors.push(`${row.title_name} / ${row.kind}: ${errorMessage(error)}`);
          break;
        }
      }

    }

    const [queueRemaining] = await sql<{ n: number }>`
      select count(*)::int as n
      from loop_media_migration_queue q
      join bridge_titles t on t.id = q.title_id
      where q.id > ${nextQueueAfterId}::bigint
        and q.status in ('PENDING_REUPLOAD', 'MISSING_SOURCE_MEDIA', 'UPLOADED')
        and q.target_provider = 'oci_object_storage'
        and q.target_path is not null
        and t.status in ('DRAFT', 'UPLOADING', 'PREPARING')
        and t.merged_into_title_id is null
        and lower(t.name) not like 'test%'
        and lower(t.name) not like '%internal test%'
        and q.asset_kind in ('MASTER', 'POSTER', 'TRAILER')
        and not exists (
          select 1 from bridge_assets a
          where a.title_id = q.title_id and a.s3_key = q.target_path
        )
    `;
    const [assetsRemaining] = await sql<{ n: number }>`
      select count(*)::int as n
      from bridge_assets a
      join bridge_titles t on t.id = a.title_id
      where a.id > ${nextAssetAfterId}
        and a.byte_size is null
        and a.s3_key is not null
        and t.status in ('DRAFT', 'UPLOADING', 'PREPARING')
        and t.merged_into_title_id is null
        and lower(t.name) not like 'test%'
        and lower(t.name) not like '%internal test%'
    `;
    const [unmatchedLegacy] = await sql<{ n: number }>`
      select count(*)::int as n
      from loop_media_migration_queue q
      left join bridge_titles t on t.id = q.title_id
      where t.id is null and q.status in ('PENDING_REUPLOAD', 'MISSING_SOURCE_MEDIA', 'UPLOADED')
    `;

    return {
      ...summary,
      nextQueueAfterId,
      nextAssetAfterId,
      queueHasMore: Number(queueRemaining?.n ?? 0) > 0,
      assetsHaveMore: Number(assetsRemaining?.n ?? 0) > 0,
      unmatchedLegacyRows: Number(unmatchedLegacy?.n ?? 0),
    };
  });
