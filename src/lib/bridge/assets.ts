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
      contentType: z.string().min(3).max(120),
      byteSize: z.number().int().positive().max(200 * 1024 * 1024 * 1024).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (!canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload")) throw new Error("Forbidden");
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
    const signed = await signUpload({
      key,
      contentType: data.contentType,
      expiresIn: uploadUrlLifetimeSeconds(data.byteSize),
    });
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

async function openUploadAsset(userId: string, assetId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    title_id: string;
    s3_key: string;
    content_type: string | null;
    byte_size: number | null;
  }>`
    select id, title_id, s3_key, content_type, byte_size
    from bridge_assets where id = ${assetId} limit 1
  `;
  const asset = rows[0];
  if (!asset) throw new Error("Asset not found");
  const title = await loadTitle(asset.title_id);
  if (!title || !canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload") || !UPLOADABLE.has(title.status)) {
    throw new Error("Upload confirmation is closed for this title");
  }
  return asset;
}

export const beginAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    assetId: z.string().min(8),
    byteSize: z.number().int().positive().max(200 * 1024 * 1024 * 1024),
  }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    if (asset.byte_size != null) throw new Error("Asset already contains bytes; canonical re-verification is required before another multipart upload");
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
    if (asset.byte_size != null) throw new Error("Asset already contains bytes; use the confirmation/re-verification path");
    const { commitMultipartUpload } = await import("./oci-object-storage.server");
    await commitMultipartUpload(data.partBaseUrl, asset.s3_key);
    return { committed: true };
  });

export const abortAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8), partBaseUrl: z.string().url().max(2000) }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    const { abortMultipartUpload } = await import("./oci-object-storage.server");
    await abortMultipartUpload(data.partBaseUrl, asset.s3_key);
    return { aborted: true };
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
      source_object_key: string | null;
      verified_object_key: string | null;
    }>`
      select id, title_id, kind, s3_key, created_by, content_type, byte_size,
        source_object_key, verified_object_key
      from bridge_assets where id = ${data.assetId} limit 1
    `;
    const asset = rows[0];
    if (!asset) throw new Error("Asset not found");
    const title = await loadTitle(asset.title_id);
    if (!title || !canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload") || !UPLOADABLE.has(title.status)) {
      throw new Error("Upload confirmation is closed for this title");
    }
    const {
      verifyObject,
      calculateObjectSha256,
      sealVerifiedObject,
      verifyObjectSha256,
    } = await import("./oci-object-storage.server");
    const verifiedSuffix = `.verified/${asset.id}`;
    const sourceKey = asset.source_object_key ||
      (asset.s3_key.endsWith(verifiedSuffix)
        ? asset.s3_key.slice(0, -verifiedSuffix.length)
        : asset.s3_key);
    const sealedKey = asset.verified_object_key || `${sourceKey}.verified/${asset.id}`;

    // Verify the original upload by reading its bytes and calculating SHA-256.
    // ETag is retained as an OCI copy precondition only; it is never a checksum.
    const sourceHead = await verifyObject(sourceKey, asset.content_type);
    const sourceDigest = await calculateObjectSha256(sourceKey);
    if (sourceHead.byteSize !== sourceDigest.byteSize) {
      throw new Error("Source object changed between HEAD and SHA-256 read-back");
    }
    if (data.expectedByteSize != null && sourceDigest.byteSize !== data.expectedByteSize) {
      throw new Error("Uploaded object size does not match the file that was sent");
    }
    if (!sourceHead.etag) throw new Error("Source object ETag is required for immutable copy");

    // Copy to the deterministic immutable key, then independently read the
    // sealed object and compare its actual bytes to the source SHA-256.
    const sealed = await sealVerifiedObject(sourceKey, sealedKey, sourceHead.etag);
    if (sealed.byteSize !== sourceDigest.byteSize || !sealed.etag) {
      throw new Error("Verified copy differs from the uploaded object");
    }
    await verifyObjectSha256(sealedKey, sourceDigest.sha256, sourceDigest.byteSize);

    // Persist the asset, canonical version, title pointer, provenance and audit
    // evidence atomically. No migration-queue state advances on persistence failure.
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: asset.id,
      actorUserId: actor.userId,
      internalActor: Boolean(actor.internalRole),
      titleId: title.id,
      kind: asset.kind,
      byteSize: sourceDigest.byteSize,
      contentType: sealed.contentType,
      checksum: sourceDigest.sha256,
      etag: sealed.etag,
      sourceKey,
      sealedKey,
      storageBucket: sealed.bucket,
      storageNamespace: sealed.namespace,
      storageRegion: sealed.region,
      storageEndpoint: sealed.endpoint,
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
      throw new Error("Canonical asset version was not persisted; refresh the title and retry verification");
    }
    return { assetId: asset.id, byteSize: sourceDigest.byteSize, verified: true };
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
      checksum_sha256: string | null;
      version_id: string | null;
      version_s3_key: string | null;
      version_checksum_sha256: string | null;
      version_byte_size: number | null;
      version_processing_state: string | null;
      created_at: string | Date;
    }>`
      select
        a.id, a.kind, a.s3_key, a.content_type, a.byte_size, a.checksum_sha256,
        v.id as version_id, v.s3_key as version_s3_key,
        v.checksum_sha256 as version_checksum_sha256, v.byte_size as version_byte_size,
        v.processing_state as version_processing_state, a.created_at
      from bridge_assets a
      left join bridge_asset_versions v on v.id = a.asset_version_id
      where a.title_id = ${title.id} and a.byte_size > 0
      order by a.created_at desc
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
          verified: Number(r.byte_size) > 0 &&
            Boolean(r.version_id) &&
            r.version_s3_key === r.s3_key &&
            Number(r.version_byte_size) === Number(r.byte_size) &&
            r.version_checksum_sha256 === r.checksum_sha256 &&
            r.version_processing_state === "PASSED",
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
export const listProductionAssets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType === "buyer" && !actor.internalRole) throw new Error("Not found");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");

    const sql = await getSql();
    const rows = await sql<{
      id: string;
      category: string;
      file_name: string;
      file_size: number | string;
      content_type: string | null;
      source_kind: string | null;
      verified_source: boolean;
    }>`
      select
        production_asset.id,
        production_asset.category,
        production_asset.file_name,
        production_asset.file_size,
        production_asset.content_type,
        production_asset.tags->>'source_kind' as source_kind,
        case
          when nullif(production_asset.tags->>'source_asset_id', '') is null then false
          else coalesce(
            source_asset.byte_size > 0
            and source_asset.storage_business_state = 'ACTIVE'
            and source_asset.restore_state = 'READY',
            false
          )
        end as verified_source
      from bridge_production_assets production_asset
      left join bridge_assets source_asset
        on source_asset.id = production_asset.tags->>'source_asset_id'
      where production_asset.title_id = ${title.id}
      order by production_asset.created_at desc, production_asset.id
      limit 500
    `;

    return {
      assets: rows.map((row) => ({
        id: row.id,
        category: row.category,
        fileName: row.file_name,
        fileSize: Number(row.file_size ?? 0),
        contentType: row.content_type,
        sourceKind: row.source_kind,
        verifiedSource: row.verified_source,
      })),
    };
  });
