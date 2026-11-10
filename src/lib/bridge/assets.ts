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
import { isSuperAdminActor } from "./asset-roles";
import { downloadDecision } from "./delivery-policy";
import { uploadUrlLifetimeSeconds } from "./upload-url-lifetime";
import { validateOttIngestFile, type OttIngestKind } from "./ott-ingest-spec";

const UPLOADABLE: ReadonlySet<string> = new Set(["DRAFT", "UPLOADING", "PREPARING"]);

async function hasFirstDeliveryOrPublish(sql: Awaited<ReturnType<typeof getSql>>, titleId: string): Promise<boolean> {
  const rows = await sql<{ locked: boolean }>`
    select (
      exists (
        select 1 from bridge_loop_publications
        where bridge_title_id = ${titleId} and approved_at is not null
      )
      or exists (
        select 1 from bridge_destination_packages
        where title_id = ${titleId} and readiness_state = 'DELIVERED'
      )
      or exists (
        select 1 from bridge_delivery_jobs
        where title_id = ${titleId}
          and admin_sign_off = true
          and delivery_receipt_url is not null
          and length(trim(delivery_receipt_url)) > 0
      )
    ) as locked
  `;
  return rows[0]?.locked === true;
}

async function assertReplacementWindow(
  sql: Awaited<ReturnType<typeof getSql>>,
  titleId: string,
  kind: string,
  assetId?: string,
) {
  const existing = await sql<{ id: string }>`
    select id from bridge_assets
    where title_id = ${titleId}
      and (kind = ${kind} or (${kind} = 'poster_vertical' and kind = 'poster'))
      and byte_size > 0 and (${assetId ?? null}::text is null or id <> ${assetId ?? null})
    order by created_at desc limit 1
  `;
  if (existing[0]) {
    // A verified asset already exists: replacement is a Super Admin-only command.
    return true;
  }
  return false;
}

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
    const sql = await getSql();
    const replacing = await assertReplacementWindow(sql, title.id, data.kind);
    if (replacing) {
      if (!isSuperAdminActor(actor.internalRole)) throw new Error("Only Super Admin can replace a verified asset");
      if (await hasFirstDeliveryOrPublish(sql, title.id)) throw new Error("Asset replacement is locked after first delivery or LOOP publication");
    } else if (!UPLOADABLE.has(title.status) && !isSuperAdminActor(actor.internalRole)) {
      throw new Error("Uploads are closed for this status");
    }
    if (isSuperAdminActor(actor.internalRole) && await hasFirstDeliveryOrPublish(sql, title.id)) {
      throw new Error("Asset replacement is locked after first delivery or LOOP publication");
    }
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
    kind: string;
    s3_key: string;
    content_type: string | null;
    byte_size: number | null;
  }>`
    select id, title_id, kind, s3_key, content_type, byte_size
    from bridge_assets where id = ${assetId} limit 1
  `;
  const asset = rows[0];
  if (!asset) throw new Error("Asset not found");
  const title = await loadTitle(asset.title_id);
  if (!title || !canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload")) {
    throw new Error("Upload confirmation is closed for this title");
  }
  const replacing = await assertReplacementWindow(sql, title.id, asset.kind, asset.id);
  if (replacing && !isSuperAdminActor(actor.internalRole)) throw new Error("Only Super Admin can replace a verified asset");
  if ((replacing || isSuperAdminActor(actor.internalRole)) && await hasFirstDeliveryOrPublish(sql, title.id)) {
    throw new Error("Asset replacement is locked after first delivery or LOOP publication");
  }
  if (!replacing && !UPLOADABLE.has(title.status) && !isSuperAdminActor(actor.internalRole)) {
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

export const inspectAssetUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    assetId: z.string().min(8),
    expectedByteSize: z.number().int().positive().optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const asset = await openUploadAsset(context.userId, data.assetId);
    if (asset.byte_size != null) throw new Error("Asset is already active; refresh the asset list");
    const { inspectObject } = await import("./oci-object-storage.server");
    const inspected = await inspectObject(asset.s3_key, asset.content_type);
    if (data.expectedByteSize != null && inspected.byteSize !== data.expectedByteSize) {
      throw new Error("Uploaded object size does not match the file that was sent");
    }
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.upload_inspected",
      entityType: "bridge_asset",
      entityId: asset.id,
      metadata: {
        titleId: asset.title_id,
        kind: asset.kind,
        byteSize: inspected.byteSize,
        etag: inspected.etag,
        checksumSha256: inspected.checksumSha256,
        checksumAlgorithm: inspected.checksumAlgorithm,
      },
    });
    return {
      assetId: asset.id,
      byteSize: inspected.byteSize,
      contentType: inspected.contentType,
      etag: inspected.etag,
      checksumSha256: inspected.checksumSha256,
      checksumAlgorithm: inspected.checksumAlgorithm,
      inspected: true as const,
    };
  });

export const confirmAssetUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      assetId: z.string().min(8),
      expectedByteSize: z.number().int().positive(),
      expectedEtag: z.string().min(1).max(256),
      expectedChecksumSha256: z.string().regex(/^(?:[a-f0-9]{64}|oci-multipart-sha256:[A-Za-z0-9+/]+={0,2}(?:-\d+)?)$/i),
      expectedChecksumAlgorithm: z.string().min(1).max(64),
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
    if (!asset) throw new Error("Asset not found");
    const title = await loadTitle(asset.title_id);
    if (!title || !canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload")) {
      throw new Error("Upload confirmation is closed for this title");
    }
    const replacing = await assertReplacementWindow(sql, title.id, asset.kind, asset.id);
    if (replacing && !isSuperAdminActor(actor.internalRole)) throw new Error("Only Super Admin can replace a verified asset");
    if ((replacing || isSuperAdminActor(actor.internalRole)) && await hasFirstDeliveryOrPublish(sql, title.id)) {
      throw new Error("Asset replacement is locked after first delivery or LOOP publication");
    }
    if (!replacing && !UPLOADABLE.has(title.status) && !isSuperAdminActor(actor.internalRole)) {
      throw new Error("Upload confirmation is closed for this title");
    }
    if (asset.byte_size != null)
      return { assetId: asset.id, byteSize: Number(asset.byte_size), verified: true };

    // The client cannot author its own checksum evidence. Require a successful
    // server-side inspection audit created by this same actor for this exact asset.
    const inspectionRows = await sql<{ metadata: Record<string, unknown> | string }>`
      select metadata
      from bridge_audit_logs
      where actor_user_id = ${actor.userId}
        and action = 'asset.upload_inspected'
        and entity_type = 'bridge_asset'
        and entity_id = ${asset.id}
      order by created_at desc
      limit 1
    `;
    const rawInspection = inspectionRows[0]?.metadata;
    const inspection = typeof rawInspection === "string"
      ? JSON.parse(rawInspection) as Record<string, unknown>
      : rawInspection;
    if (
      !inspection ||
      inspection.titleId !== title.id ||
      inspection.kind !== asset.kind ||
      Number(inspection.byteSize) !== data.expectedByteSize ||
      inspection.etag !== data.expectedEtag ||
      inspection.checksumAlgorithm !== data.expectedChecksumAlgorithm ||
      String(inspection.checksumSha256 ?? "").toLowerCase() !== data.expectedChecksumSha256.toLowerCase()
    ) {
      throw new Error("No matching server-side storage inspection exists. Inspect the uploaded file again before activation.");
    }

    const { verifyObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    const object = await verifyObject(asset.s3_key, asset.content_type);
    if (object.byteSize !== data.expectedByteSize || object.etag !== data.expectedEtag) {
      throw new Error("The uploaded object changed after inspection. Inspect it again before activation.");
    }
    if (!object.etag) throw new Error("Object ETag is required for immutable verification");
    // OCI ETag is used only as a source-object concurrency token. The SHA-256
    // evidence was computed by OCI or by the streamed fallback during inspection.
    const sealedKey = `${asset.s3_key}.verified/${asset.id}`;
    const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, object.etag);
    if (sealed.byteSize !== object.byteSize || !sealed.etag) {
      throw new Error("Verified copy differs from the uploaded object");
    }
    // CopyObject is conditional on the inspected source ETag. OCI confirms the
    // completed destination by HEAD; the inspected source checksum remains bound
    // to the exact bytes copied without downloading a second full film.
    if (sealed.byteSize !== data.expectedByteSize) {
      throw new Error("The immutable copy byte size does not match the inspected upload");
    }
    // Persist asset/title/audit state first. Do not advance the migration queue
    // if persistence fails: its prior state remains the truthful state.
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: asset.id,
      actorUserId: actor.userId,
      internalActor: Boolean(actor.internalRole),
      superAdminActor: isSuperAdminActor(actor.internalRole),
      titleId: title.id,
      kind: asset.kind,
      byteSize: sealed.byteSize,
      contentType: sealed.contentType,
      checksum: data.expectedChecksumSha256.toLowerCase(),
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
        // queue into line with that durable state before returning idempotently.
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
        return { assetId: asset.id, byteSize: Number(current[0].byte_size), verified: true };
      }
      throw new Error("Asset confirmation changed; retry after refreshing the title");
    }
    return { assetId: asset.id, byteSize: sealed.byteSize, checksumSha256: data.expectedChecksumSha256.toLowerCase(), verified: true };
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
