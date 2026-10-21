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


const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const MULTIPART_PART_SIZE = 32 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 10 * 1024 ** 4;

async function requireUploadSessionAccess(
  session: { created_by: string; title_id: string; status: string },
  actor: Awaited<ReturnType<typeof requireVerifiedActor>>,
) {
  if (session.created_by !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload")) {
    throw new Error("Upload session not found");
  }
  const title = await loadTitle(session.title_id);
  if (
    !title ||
    (title.ownerUserId !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload"))
  ) {
    throw new Error("Upload session not found");
  }
  return title;
}

/** Start a durable OCI multipart session for large media. The bearer URL is returned only in memory. */
export const requestAssetMultipartUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    kind: z.enum(ASSET_KINDS),
    filename: z.string().min(1).max(120),
    contentType: z.string().min(3).max(120),
    fileSize: z.number().int().min(MULTIPART_THRESHOLD).max(MAX_MULTIPART_BYTES),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (title.ownerUserId !== actor.userId && !hasStaffPermission(actor, "asset.sign_upload")) {
      throw new Error("Forbidden");
    }
    if (!UPLOADABLE.has(title.status)) throw new Error("Uploads are closed for this status");
    const allowedKinds = ["master", "poster", "poster_vertical", "poster_horizontal", "thumbnail", "subtitle", "screener", "technical", "censor_certificate"];
    if (!allowedKinds.includes(data.kind)) throw new Error("This asset kind is not supported by the OTT ingest uploader");
    const validation = validateOttIngestFile({
      kind: data.kind as OttIngestKind,
      filename: data.filename,
      contentType: data.contentType,
    });
    if (!validation.ok) throw new Error(validation.message);
    const partCount = Math.ceil(data.fileSize / MULTIPART_PART_SIZE);
    if (partCount < 2 || partCount > 10_000) throw new Error("File size is outside OCI multipart limits");

    const { startMultipartUpload, abortMultipartUpload } = await import("./oci-object-storage.server");
    const key = (await import("./oci-object-storage.server")).titleAssetKey({
      ownerUserId: title.ownerUserId,
      titleId: title.id,
      kind: data.kind,
      filename: data.filename,
    });
    const multipart = await startMultipartUpload({ key, contentType: data.contentType });
    const assetId = randomBytes(16).toString("hex");
    const sessionId = randomBytes(16).toString("hex");
    const sql = await getSql();
    try {
      await sql`
        insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
        values (${assetId}, ${title.id}, ${data.kind}, ${key}, ${data.contentType}, ${actor.userId})
      `;
      await sql`
        insert into bridge_asset_upload_sessions
          (id, asset_id, title_id, created_by, object_key, filename, content_type,
           file_size, part_size, upload_id, encrypted_access_uri, status, expires_at)
        values
          (${sessionId}, ${assetId}, ${title.id}, ${actor.userId}, ${key}, ${data.filename},
           ${data.contentType}, ${data.fileSize}, ${MULTIPART_PART_SIZE}, ${multipart.uploadId},
           ${multipart.encryptedAccessUri}, 'ACTIVE', ${multipart.expiresAt})
      `;
    } catch (error) {
      try { await abortMultipartUpload(multipart.encryptedAccessUri); } catch { /* best-effort cleanup */ }
      try {
        await sql`delete from bridge_assets where id = ${assetId} and created_by = ${actor.userId} and byte_size is null`;
      } catch { /* preserve the original failure; cleanup can be audited separately */ }
      throw error;
    }
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.multipart_upload_started",
      entityType: "bridge_asset",
      entityId: assetId,
      metadata: { titleId: title.id, kind: data.kind, fileSize: data.fileSize, partSize: MULTIPART_PART_SIZE },
    });
    return {
      assetId,
      sessionId,
      uploadUrl: multipart.uploadUrl,
      fileSize: data.fileSize,
      partSize: MULTIPART_PART_SIZE,
      status: "ACTIVE" as const,
      parts: [] as Array<{ partNumber: number; etag: string; checksum: string; byteSize: number }>,
    };
  });

/** Rehydrate an upload URL from its encrypted server-side session after route navigation or reload. */
export const resumeAssetMultipartUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ sessionId: z.string().min(16).max(128) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const sql = await getSql();
    const rows = await sql<{
      id: string; asset_id: string; title_id: string; created_by: string; status: string;
      file_size: number | string; part_size: number | string; encrypted_access_uri: string;
      expires_at: string | Date; object_key: string; content_type: string; upload_id: string;
    }>`
      select id, asset_id, title_id, created_by, status, file_size, part_size,
             encrypted_access_uri, expires_at, object_key, content_type, upload_id
      from bridge_asset_upload_sessions where id = ${data.sessionId} limit 1
    `;
    const session = rows[0];
    if (!session) throw new Error("Upload session not found");
    await requireUploadSessionAccess(session, actor);
    if (["ABORTED", "FAILED"].includes(session.status)) throw new Error("This upload session is no longer resumable");
    if (session.status === "ACTIVE" && new Date(session.expires_at).getTime() <= Date.now()) {
      const { abortMultipartUploadById } = await import("./oci-object-storage.server");
      let cleaned = false;
      try {
        await abortMultipartUploadById(session.object_key, session.upload_id);
        cleaned = true;
      } catch { /* leave the expired session retryable if OCI cleanup is unavailable */ }
      if (cleaned) {
        await sql`update bridge_asset_upload_sessions set status = 'ABORTED', updated_at = now() where id = ${session.id} and status = 'ACTIVE'`;
        throw new Error("Upload session expired; restart the upload");
      }
      throw new Error("Upload session expired; cleanup is still pending. Retry resume after storage recovers.");
    }
    const partRows = await sql<{ part_number: number; etag: string; checksum: string; byte_size: number | string }>`
      select part_number, etag, checksum, byte_size from bridge_asset_upload_parts
      where session_id = ${session.id} order by part_number asc
    `;
    const { decryptMultipartAccessUri } = await import("./oci-object-storage.server");
    return {
      assetId: session.asset_id,
      sessionId: session.id,
      uploadUrl: session.status === "ACTIVE" ? decryptMultipartAccessUri(session.encrypted_access_uri) : null,
      fileSize: Number(session.file_size),
      partSize: Number(session.part_size),
      status: session.status,
      parts: partRows.map((part) => ({
        partNumber: part.part_number,
        etag: part.etag,
        checksum: part.checksum,
        byteSize: Number(part.byte_size),
      })),
    };
  });

/** Record a part only after OCI returned a successful response and ETag. Retrying a part is idempotent. */
export const recordAssetMultipartPart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    sessionId: z.string().min(16).max(128),
    partNumber: z.number().int().min(1).max(10_000),
    etag: z.string().min(1).max(256),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().positive(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const sql = await getSql();
    const rows = await sql<{
      id: string; title_id: string; created_by: string; status: string;
      file_size: number | string; part_size: number | string;
    }>`
      select id, title_id, created_by, status, file_size, part_size
      from bridge_asset_upload_sessions where id = ${data.sessionId} limit 1
    `;
    const session = rows[0];
    if (!session) throw new Error("Upload session not found");
    await requireUploadSessionAccess(session, actor);
    if (session.status !== "ACTIVE") throw new Error("Upload session is not accepting parts");
    const fileSize = Number(session.file_size);
    const partSize = Number(session.part_size);
    const totalParts = Math.ceil(fileSize / partSize);
    if (data.partNumber > totalParts) throw new Error("Invalid part number");
    const expectedSize = Math.min(partSize, fileSize - (data.partNumber - 1) * partSize);
    if (data.byteSize !== expectedSize) throw new Error("Uploaded part size does not match the expected chunk size");
    const etag = data.etag.replaceAll('"', "");
    if (!etag || /[\r\n]/.test(etag)) throw new Error("Invalid part ETag");
    await sql`
      insert into bridge_asset_upload_parts (session_id, part_number, etag, checksum, byte_size)
      values (${session.id}, ${data.partNumber}, ${etag}, ${data.checksum}, ${data.byteSize})
      on conflict (session_id, part_number) do update
        set etag = excluded.etag, checksum = excluded.checksum, byte_size = excluded.byte_size, updated_at = now()
    `;
    return { recorded: true, partNumber: data.partNumber };
  });

/** Commit only when every expected part is durably recorded; safe to retry after a lost response. */
export const finalizeAssetMultipartUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ sessionId: z.string().min(16).max(128) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const sql = await getSql();
    const rows = await sql<{
      id: string; asset_id: string; title_id: string; created_by: string; status: string;
      file_size: number | string; part_size: number | string; encrypted_access_uri: string;
      object_key: string; content_type: string; updated_at: string | Date;
    }>`
      select id, asset_id, title_id, created_by, status, file_size, part_size,
             encrypted_access_uri, object_key, content_type, updated_at
      from bridge_asset_upload_sessions where id = ${data.sessionId} limit 1
    `;
    const session = rows[0];
    if (!session) throw new Error("Upload session not found");
    const title = await requireUploadSessionAccess(session, actor);
    if (!UPLOADABLE.has(title.status)) throw new Error("Uploads are closed for this title");
    if (session.status === "COMMITTED" || session.status === "COMPLETED") {
      return { assetId: session.asset_id, expectedByteSize: Number(session.file_size), committed: true };
    }
    const fileSize = Number(session.file_size);
    const partSize = Number(session.part_size);
    const { commitMultipartUpload, verifyObject } = await import("./oci-object-storage.server");
    if (session.status === "COMMITTING") {
      const committingForMs = Date.now() - new Date(session.updated_at).getTime();
      if (committingForMs < 120_000) throw new Error("Upload session is already being finalized; retry shortly");
      try {
        const object = await verifyObject(session.object_key, session.content_type);
        if (object.byteSize === fileSize) {
          await sql`update bridge_asset_upload_sessions set status = 'COMMITTED', updated_at = now() where id = ${session.id} and status = 'COMMITTING'`;
          return { assetId: session.asset_id, expectedByteSize: fileSize, committed: true };
        }
      } catch { /* Object absent or incomplete; safely retry the durable part ledger. */ }
      await sql`update bridge_asset_upload_sessions set status = 'ACTIVE', updated_at = now() where id = ${session.id} and status = 'COMMITTING'`;
    }
    if (session.status !== "ACTIVE" && session.status !== "COMMITTING") {
      throw new Error("Upload session is not ready to commit");
    }
    const totalParts = Math.ceil(fileSize / partSize);
    const partRows = await sql<{ part_number: number; etag: string; checksum: string; byte_size: number | string }>`
      select part_number, etag, checksum, byte_size from bridge_asset_upload_parts
      where session_id = ${session.id} order by part_number asc
    `;
    if (partRows.length !== totalParts) throw new Error("Upload is incomplete; retry missing parts before finalizing");
    for (let i = 0; i < totalParts; i += 1) {
      const part = partRows[i];
      const expectedSize = Math.min(partSize, fileSize - i * partSize);
      if (part.part_number !== i + 1 || Number(part.byte_size) !== expectedSize || !part.etag) {
        throw new Error("Upload part ledger is incomplete or inconsistent");
      }
    }
    const claimed = await sql<{ id: string }>`
      update bridge_asset_upload_sessions set status = 'COMMITTING', updated_at = now()
      where id = ${session.id} and status = 'ACTIVE'
      returning id
    `;
    if (!claimed[0]) throw new Error("Upload session is already being finalized; retry shortly");
    try {
      await commitMultipartUpload(session.encrypted_access_uri);
    } catch (error) {
      // A response can be lost after OCI commits. Treat an exact-size object as an
      // idempotent success; otherwise restore ACTIVE so the user can retry.
      try {
        const object = await verifyObject(session.object_key, session.content_type);
        if (object.byteSize !== fileSize) throw new Error("Committed object size mismatch");
      } catch {
        await sql`update bridge_asset_upload_sessions set status = 'ACTIVE', updated_at = now() where id = ${session.id} and status = 'COMMITTING'`;
        throw error;
      }
    }
    await sql`
      update bridge_asset_upload_sessions set status = 'COMMITTED', updated_at = now()
      where id = ${session.id} and status = 'COMMITTING'
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.multipart_upload_committed",
      entityType: "bridge_asset",
      entityId: session.asset_id,
      metadata: { titleId: session.title_id, fileSize, partCount: totalParts },
    });
    return { assetId: session.asset_id, expectedByteSize: fileSize, committed: true };
  });

export const completeAssetMultipartUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ sessionId: z.string().min(16).max(128) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const sql = await getSql();
    const rows = await sql<{ id: string; asset_id: string; title_id: string; created_by: string; status: string }>`
      select id, asset_id, title_id, created_by, status
      from bridge_asset_upload_sessions where id = ${data.sessionId} limit 1
    `;
    const session = rows[0];
    if (!session) throw new Error("Upload session not found");
    await requireUploadSessionAccess(session, actor);
    if (session.status === "COMPLETED") return { completed: true };
    if (session.status !== "COMMITTED") throw new Error("Multipart upload must be committed before completion");
    const verified = await sql<{ byte_size: number | string | null }>`
      select byte_size from bridge_assets where id = ${session.asset_id} limit 1
    `;
    if (verified[0]?.byte_size == null || Number(verified[0].byte_size) <= 0) {
      throw new Error("Asset integrity verification must succeed before session completion");
    }
    await sql`
      update bridge_asset_upload_sessions set status = 'COMPLETED', completed_at = now(), updated_at = now()
      where id = ${session.id} and status = 'COMMITTED'
    `;
    return { completed: true };
  });

export const abortAssetMultipartUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ sessionId: z.string().min(16).max(128) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    const sql = await getSql();
    const rows = await sql<{ id: string; asset_id: string; title_id: string; created_by: string; status: string; encrypted_access_uri: string; object_key: string; upload_id: string }>`
      select id, asset_id, title_id, created_by, status, encrypted_access_uri, object_key, upload_id
      from bridge_asset_upload_sessions where id = ${data.sessionId} limit 1
    `;
    const session = rows[0];
    if (!session) return { aborted: true };
    await requireUploadSessionAccess(session, actor);
    if (session.status === "ABORTED") return { aborted: true };
    if (["COMMITTED", "COMPLETED"].includes(session.status)) {
      throw new Error("A committed upload cannot be aborted; verify or replace the asset instead");
    }
    if (session.status !== "ACTIVE") {
      throw new Error("Upload finalization is in progress; wait before cancelling");
    }
    const { abortMultipartUpload, abortMultipartUploadById } = await import("./oci-object-storage.server");
    try {
      await abortMultipartUpload(session.encrypted_access_uri);
    } catch {
      await abortMultipartUploadById(session.object_key, session.upload_id);
    }
    await sql`
      update bridge_asset_upload_sessions set status = 'ABORTED', updated_at = now()
      where id = ${session.id} and status = 'ACTIVE'
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.multipart_upload_aborted",
      entityType: "bridge_asset",
      entityId: session.asset_id,
      metadata: { titleId: session.title_id },
    });
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
