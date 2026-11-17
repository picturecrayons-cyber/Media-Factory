import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ASSET_KINDS } from "./types";
import { assertPermission, canOperateOnTitle, canReadTitle, hasStaffPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { persistVerifiedAsset } from "./asset-confirmation";
import { downloadDecision } from "./delivery-policy";
import { uploadUrlLifetimeSeconds } from "./upload-url-lifetime";
import { validateOttIngestFile, type OttIngestKind } from "./ott-ingest-spec";

const UPLOADABLE: ReadonlySet<string> = new Set(["DRAFT", "UPLOADING", "PREPARING"]);

async function hasLicenseEntitlement(userId: string, titleId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from bridge_entitlements
    where user_id = ${userId} and title_id = ${titleId} and access_type = 'license'
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

export const requestAssetUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      kind: z.enum(ASSET_KINDS),
      filename: z.string().min(1).max(120),
      contentType: z.string().min(3).max(120ֻǱ˞export const beginAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    assetId: z.string().min(8),
    byteSize: z.number().int().positive().max(200 * 1024 * 1024 * 1024),
  }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    if (asset.byte_size != null) return { assetId: asset.id, alreadyVerified: true as const };
    const { beginMultipartUpload } = await import("./oci-object-storage.server");
    const expiresIn = uploadUrlLifetimeSeconds(data.byteSize);
    const started = await beginMultipartUpload({
      key: asset.s3_key,
      contentType: asset.content_type || "application/octet-stream",
      expiresIn,
    });
    return {
      assetId: asset.id,
      alreadyVerified: false as const,
      uploadId: started.uploadId,
      partBaseUrl: started.partBaseUrl,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  });

export const commitAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8), partBaseUrl: z.string().url().max(2000) }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    if (asset.byte_size != null) return { committed: true };
    const { commitMultipartUpload } = await import("./oci-object-storage.server");
    await commitMultipartUpload(data.partBaseUrl, asset.s3_key);
    retuֻǱ˞    const confirmed = await persistVerifiedAsset(sql, {
      assetId: asset.id,
      actorUserId: actor.userId,
      internalActor: Boolean(actor.internalRole),
      titleId: title.id,
      kind: asset.kind,
      byteSize: sealed.byteSize,
      contentType: sealed.contentType,
      checksum: sealed.etag,
      sourceKey: asset.s3_key,
      sealedKey,
    });
    if (confirmed) {
      // UPLOADED is only recorded after persistVerifiedAsset succeeds.
      await sql`
        update loop_media_migration_queue
        set status = 'UPLOADED', target_path = ${sealedKey}, updated_at = now()
        where title_id = ${title.id}
          and asset_kind = case when ${asset.kind} = 'screener' then 'TRAILER' else upper(${asset.kind}) end
          and status in ('PENDING_REUPLOAD', 'UPLOADED')
      `;
      await sql`
        update loop_media_migration_queue
        set status = 'VERIFIED', target_path = ${sealedKey}, updated_at = now()
        where title_id = ${title.id}
          and asset_kind = case when ${asset.kind} = 'screener' then 'TRAILER' else upper(${asset.kind}) end
          and status in ('UPLOADED', 'PENDING_REUPLOAD')
      `;
    }
    if (!confirmed) {
      const current = await sql<{
        byte_size: number | null;
      }>`select byte_size from bridge_assets where id = ${asset.id}`;
      if (current[0]?.byte_size != null) {
        // A concurrent confirmation persisted the asset successfully. Bring the
        // queue into line with that durable ֻǱ˞  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const sql = await getSql();
    const buyer = actor.accountType === "buyer" && !actor.internalRole;
    const rows = await sql<{
      id: string;
      kind: string;
      s3_key: string;
      content_type: string | null;
      byte_size: number | null;
      created_at: string | Date;
    }>`
      select id, kind, s3_key, content_type, byte_size, created_at
      from bridge_assets where title_id = ${title.id} and byte_size > 0 order by created_at desc
    `;
    return {
      assets: rows
        .filter((r) => !buyer || !["master", "technical", "censor_certificate"].includes(r.kind))
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          key: buyer ? null : r.s3_key,
          contentType: r.content_type,
          byteSize: r.byte_size,
          verified: Number(r.byte_size) > 0,
          createdAt:
            r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
    };
  });


/**
 * Lists the Production register for one title without returning OCI object keys.
 * Each row is visibility-checked against the canonical Bridge title before it
 * can be returned to an owner or an authorized internal reviewer.
 */
export conֻǱ˞