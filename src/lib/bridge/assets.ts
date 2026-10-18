import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ASSET_KINDS } from "./types";
import { assertPermission, canReadTitle, hasStaffPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { persistVerifiedAsset } from "./asset-confirmation";
import { downloadDecision } from "./delivery-policy";
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
      contentType: z.string().min(3).max(120),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (title.ownerUserId !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload")) throw new Error("Forbidden");
    if (!UPLOADABLE.has(title.status)) throw new Error("Uploads are closed for this status");
    if (!["master", "poster", "poster_vertical", "poster_horizontal", "thumbnail", "subtitle", "screener", "technical", "censor_certificate"].includes(data.kind))
      throw new Error("This asset kind is not supported by the OTT ingest uploader");
    const ingestValidation = validateOttIngestFile({
      kind: data.kind as OttIngestKind,
      filename: data.filename,
      contentType: data.contentType,
    });
    if (!ingestValidation.ok) throw new Error(ingestValidation.message);
    const { signUpload, titleAssetKey } = await import("./oci-object-storage.server");
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
    await sql`
      update loop_media_migration_queue
      set status = 'UPLOADED', target_path = ${key}, updated_at = now()
      where title_id = ${title.id}
        and asset_kind = case when ${data.kind} = 'screener' then 'TRAILER' else upper(${data.kind}) end
        and status in ('PENDING_REUPLOAD', 'UPLOADED')
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
  .validator(
    z.object({
      assetId: z.string().min(8),
      expectedByteSize: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      kind: string;
      s3_key: string;
      created_by: string;
      content_type: string | null;
      byte_size: number | null;
    }>`
      select id, title_id, kind, s3_key, created_by, content_type, byte_size
      from bridge_assets where id = ${data.assetId} limit 1
    `;
    const asset = rows[0];
    if (!asset || (asset.created_by !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload"))) throw new Error("Asset not found");
    const title = await loadTitle(asset.title_id);
    if (!title || (title.ownerUserId !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload")) || !UPLOADABLE.has(title.status)) {
      throw new Error("Upload confirmation is closed for this title");
    }
    if (asset.byte_size != null)
      return { assetId: asset.id, byteSize: Number(asset.byte_size), verified: true };

    const { verifyObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    const object = await verifyObject(asset.s3_key, asset.content_type);
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
    if (confirmed) {
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
      if (current[0]?.byte_size != null)
        return { assetId: asset.id, byteSize: Number(current[0].byte_size), verified: true };
      throw new Error("Asset confirmation changed; retry after refreshing the title");
    }
    return { assetId: asset.id, byteSize: sealed.byteSize, verified: true };
  });


// Multipart flow is used for large files; object bytes travel directly from the browser to OCI.
export const startAssetMultipartUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    kind: z.enum(ASSET_KINDS),
    filename: z.string().min(1).max(120),
    contentType: z.string().min(3).max(120),
    expectedByteSize: z.number().int().min(100 * 1024 * 1024).max(10_000 * 10 * 1024 * 1024),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const title = await loadTitle(data.titleId);
    if (!title || (title.ownerUserId !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload"))) throw new Error("Not found");
    if (!UPLOADABLE.has(title.status)) throw new Error("Uploads are closed for this status");
    const kind = data.kind as OttIngestKind;
    const validation = validateOttIngestFile({ kind, filename: data.filename, contentType: data.contentType });
    if (!validation.ok) throw new Error(validation.message);
    const id = randomBytes(16).toString("hex");
    const { titleAssetKey, startMultipartUpload } = await import("./oci-object-storage.server");
    const key = titleAssetKey({ ownerUserId: title.ownerUserId, titleId: title.id, kind: data.kind, filename: data.filename });
    const sql = await getSql();
    await sql`insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by, upload_expected_byte_size, upload_state)
      values (${id}, ${title.id}, ${data.kind}, ${key}, ${data.contentType}, ${actor.userId}, ${data.expectedByteSize}, 'STARTING')`;
    try {
      const multipart = await startMultipartUpload({ key, contentType: data.contentType });
      await sql`update bridge_assets set multipart_upload_id = ${multipart.uploadId}, upload_state = 'UPLOADING'
        where id = ${id} and created_by = ${actor.userId} and byte_size is null`;
      await writeAudit({ actorUserId: actor.userId, action: "asset.multipart_started", entityType: "bridge_asset", entityId: id,
        metadata: { titleId: title.id, kind: data.kind, expectedByteSize: data.expectedByteSize } });
      return { assetId: id, uploadId: multipart.uploadId, partSize: 10 * 1024 * 1024, key };
    } catch (error) {
      await sql`update bridge_assets set upload_state = 'FAILED' where id = ${id}`;
      throw error;
    }
  });

async function ownedPendingMultipartAsset(assetId: string, userId: string) {
  const actor = await requireVerifiedActor(userId);
  assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
  const sql = await getSql();
  const rows = await sql<{
    id: string; title_id: string; kind: string; s3_key: string; created_by: string; content_type: string | null;
    multipart_upload_id: string | null; upload_expected_byte_size: number | null;
    upload_state: string | null; byte_size: number | null;
  }>`select id, title_id, kind, s3_key, created_by, content_type, multipart_upload_id, upload_expected_byte_size,
      upload_state, byte_size from bridge_assets where id = ${assetId} limit 1`;
  const asset = rows[0];
  if (!asset || (asset.created_by !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload")) || asset.byte_size != null || !asset.multipart_upload_id) {
    throw new Error("Pending multipart asset not found");
  }
  const title = await loadTitle(asset.title_id);
  if (!title || (title.ownerUserId !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload")) || !UPLOADABLE.has(title.status)) {
    throw new Error("Multipart upload is closed for this title");
  }
  return { actor, asset, title, sql };
}

export const signAssetMultipartPart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8), partNum: z.number().int().min(1).max(10000) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const { asset } = await ownedPendingMultipartAsset(data.assetId, context.userId);
    if (asset.upload_state !== "UPLOADING") throw new Error("Multipart upload is not active");
    const { signMultipartPart } = await import("./oci-object-storage.server");
    return await signMultipartPart({ key: asset.s3_key, uploadId: asset.multipart_upload_id!, partNum: data.partNum });
  });

export const listAssetMultipartParts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const { asset } = await ownedPendingMultipartAsset(data.assetId, context.userId);
    const { listMultipartUploadParts } = await import("./oci-object-storage.server");
    return { parts: await listMultipartUploadParts({ key: asset.s3_key, uploadId: asset.multipart_upload_id! }) };
  });

export const cancelAssetMultipartUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const { actor, asset, sql } = await ownedPendingMultipartAsset(data.assetId, context.userId);
    const { abortMultipartUpload } = await import("./oci-object-storage.server");
    const result = await abortMultipartUpload({ key: asset.s3_key, uploadId: asset.multipart_upload_id! });
    await sql`update bridge_assets set upload_state = 'CANCELED' where id = ${asset.id} and byte_size is null`;
    await writeAudit({ actorUserId: actor.userId, action: "asset.multipart_canceled", entityType: "bridge_asset", entityId: asset.id });
    return result;
  });

export const commitAssetMultipartUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const { actor, asset, title, sql } = await ownedPendingMultipartAsset(data.assetId, context.userId);
    if (asset.upload_state !== "UPLOADING" || !asset.upload_expected_byte_size) {
      throw new Error("Multipart upload metadata is incomplete");
    }
    const { listMultipartUploadParts, commitMultipartUpload, checksumObject, sealVerifiedObject } =
      await import("./oci-object-storage.server");
    const parts = await listMultipartUploadParts({ key: asset.s3_key, uploadId: asset.multipart_upload_id! });
    if (!parts.length || parts.some((part) => !part.size)) throw new Error("OCI has no complete multipart part manifest");
    const object = await commitMultipartUpload({ key: asset.s3_key, uploadId: asset.multipart_upload_id!, parts });
    if (object.byteSize !== Number(asset.upload_expected_byte_size)) throw new Error("Committed object size differs from the original file");
    if (asset.content_type && object.contentType !== asset.content_type) throw new Error("Committed object content type differs from the asset record");
    if (!object.etag) throw new Error("Committed OCI object has no ETag; immutable sealing is blocked");
    const checksum = await checksumObject(asset.s3_key);
    if (checksum.byteSize !== object.byteSize) {
      await sql`update bridge_assets set upload_state = 'INTEGRITY_FAILED' where id = ${asset.id}`;
      await writeAudit({ actorUserId: actor.userId, action: "asset.multipart_integrity_failed", entityType: "bridge_asset", entityId: asset.id,
        metadata: { actualSha256: checksum.sha256, expectedByteSize: asset.upload_expected_byte_size, actualByteSize: checksum.byteSize } });
      throw new Error("Stored object readback size does not match the original file size");
    }
    const sealedKey = `${asset.s3_key}.verified/${randomUUID()}`;
    const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, object.etag || "");
    const sealedChecksum = await checksumObject(sealedKey);
    if (sealed.byteSize !== checksum.byteSize || sealedChecksum.sha256 !== checksum.sha256) {
      await sql`update bridge_assets set upload_state = 'INTEGRITY_FAILED' where id = ${asset.id}`;
      throw new Error("Immutable sealed copy failed SHA-256 verification");
    }
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: asset.id, actorUserId: actor.userId, internalActor: Boolean(actor.internalRole), titleId: title.id,
      kind: asset.kind, byteSize: sealed.byteSize, contentType: sealed.contentType, checksum: sealedChecksum.sha256,
      sourceKey: asset.s3_key, sealedKey,
    });
    if (!confirmed) throw new Error("Asset state changed before multipart verification could be committed");
    await sql`update bridge_assets set upload_state = 'VERIFIED', checksum_sha256 = ${sealedChecksum.sha256} where id = ${asset.id}`;
    await sql`update loop_media_migration_queue set status = 'VERIFIED', target_path = ${sealedKey}, updated_at = now()
      where title_id = ${title.id} and asset_kind = case when ${asset.kind} = 'screener' then 'TRAILER' else upper(${asset.kind}) end
        and status in ('UPLOADED', 'PENDING_REUPLOAD')`;
    return { assetId: asset.id, byteSize: sealed.byteSize, sha256: sealedChecksum.sha256, verified: true };
  });

export const requestAssetDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
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
    const { signDownload } = await import("./oci-object-storage.server");
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
