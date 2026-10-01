import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ASSET_KINDS } from "./types";
import { assertPermission, canReadTitle } from "./rbac";
import { requireActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { persistVerifiedAsset } from "./asset-confirmation";
import { downloadDecision } from "./delivery-policy";

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
      contentType: z.string().min(3).max(120),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "asset.sign_upload");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (title.ownerUserId !== actor.userId && !actor.internalRole) throw new Error("Forbidden");
    if (!UPLOADABLE.has(title.status)) throw new Error("Uploads are closed for this status");
    const { signUpload, titleAssetKey } = await import("./aws-object-storage.server");
    const key = titleAssetKey({
      ownerUserId: title.ownerUserId,
      titleId: title.id,
      kind: data.kind,
      filename: data.filename,
    });
    const signed = await signUpload({ key, contentType: data.contentType });
    const id = randomBytes(16).toString("hex");
    const sql = await getSql();
    await sql`
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
      values (${id}, ${title.id}, ${data.kind}, ${key}, ${data.contentType}, ${actor.userId})
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.upload_signed",
      entityType: "bridge_asset",
      entityId: id,
      metadata: { titleId: title.id, kind: data.kind },
    });
    return { assetId: id, ...signed };
  });

export const confirmAssetUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8), expectedByteSize: z.number().int().positive().optional() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "asset.sign_upload");
    const sql = await getSql();
    const rows = await sql<{
      id: string; title_id: string; kind: string; s3_key: string;
      created_by: string; byte_size: number | null;
    }>`
      select id, title_id, kind, s3_key, created_by, byte_size
      from bridge_assets where id = ${data.assetId} limit 1
    `;
    const asset = rows[0];
    if (!asset || (asset.created_by !== actor.userId && !actor.internalRole)) throw new Error("Asset not found");
    const title = await loadTitle(asset.title_id);
    if (!title || (title.ownerUserId !== actor.userId && !actor.internalRole) || !UPLOADABLE.has(title.status)) {
      throw new Error("Upload confirmation is closed for this title");
    }
    if (asset.byte_size != null) return { assetId: asset.id, byteSize: Number(asset.byte_size), verified: true };

    const { verifyObject, sealVerifiedObject } = await import("./aws-object-storage.server");
    const object = await verifyObject(asset.s3_key);
    if (data.expectedByteSize != null && object.byteSize !== data.expectedByteSize) {
      throw new Error("Uploaded object size does not match the file that was sent");
    }
    if (!object.etag) throw new Error("Object ETag is required for immutable verification");
    const sealedKey = `${asset.s3_key}.verified/${randomUUID()}`;
    const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, object.etag);
    if (sealed.byteSize !== object.byteSize || !sealed.etag) {
      throw new Error("Verified copy differs from the uploaded object");
    }
    const confirmed = await persistVerifiedAsset(sql, {
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
    if (!confirmed) {
      const current = await sql<{ byte_size: number | null }>`select byte_size from bridge_assets where id = ${asset.id}`;
      if (current[0]?.byte_size != null) return { assetId: asset.id, byteSize: Number(current[0].byte_size), verified: true };
      throw new Error("Asset confirmation changed; retry after refreshing the title");
    }
    return { assetId: asset.id, byteSize: sealed.byteSize, verified: true };
  });

export const requestAssetDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "asset.sign_download");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      kind: string;
      s3_key: string;
      byte_size: number | null;
    }>`
      select id, title_id, kind, s3_key, byte_size from bridge_assets where id = ${data.assetId} and byte_size > 0 limit 1
    `;
    const asset = rows[0];
    if (!asset) throw new Error("Not found");
    const title = await loadTitle(asset.title_id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const entitled = await hasLicenseEntitlement(actor.userId, title.id);
    const decision = downloadDecision({
      kind: asset.kind,
      actorIsOwner: title.ownerUserId === actor.userId,
      actorIsInternal: Boolean(actor.internalRole),
      accountType: actor.accountType,
      hasLicenseEntitlement: entitled,
    });
    if (!decision.allow) {
      await writeAudit({
        actorUserId: actor.userId,
        action: "asset.download_denied",
        entityType: "bridge_asset",
        entityId: asset.id,
        metadata: { reason: decision.reason, kind: asset.kind },
      });
      throw new Error(decision.reason);
    }
    const { signDownload } = await import("./aws-object-storage.server");
    const signed = await signDownload({ key: asset.s3_key });
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.download_signed",
      entityType: "bridge_asset",
      entityId: asset.id,
    });
    return signed;
  });

export const listTitleAssets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireActor(context.userId);
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
        .filter((r) => !buyer || r.kind !== "master")
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          key: buyer ? null : r.s3_key,
          contentType: r.content_type,
          byteSize: r.byte_size,
          verified: Number(r.byte_size) > 0,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
    };
  });
