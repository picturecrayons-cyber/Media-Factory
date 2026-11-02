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
import { encryptMultipartCapability, decryptMultipartCapability } from "./multipart-session-crypto.server";

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
    if (asset.byte_size != null) return { assetId: asset.id, alreadyVerified: true as const };
    const { beginMultipartUpload, abortMultipartUpload } = await import("./oci-object-storage.server");
    const expiresIn = uploadUrlLifetimeSeconds(data.byteSize);
    const started = await beginMultipartUpload({
      key: asset.s3_key,
      contentType: asset.content_type || "application/octet-stream",
      expiresIn,
    });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    try {
      const sql = await getSql();
      await sql`
        insert into bridge_asset_multipart_sessions
          (asset_id, title_id, created_by, object_key, upload_id, part_base_url_ciphertext,
           file_name, file_size, part_size, last_modified, status, expires_at)
        values
          (${asset.id}, ${asset.title_id}, ${context.userId}, ${asset.s3_key}, ${started.uploadId},
           ${encryptMultipartCapability(started.partBaseUrl)}, '', ${data.byteSize},
           ${16 * 1024 * 1024}, 0, 'active', ${expiresAt.toISOString()})
        on conflict (asset_id) do update set
          title_id = excluded.title_id,
          created_by = excluded.created_by,
          object_key = excluded.object_key,
          upload_id = excluded.upload_id,
          part_base_url_ciphertext = excluded.part_base_url_ciphertext,
          file_size = excluded.file_size,
          part_size = excluded.part_size,
          status = 'active',
          expires_at = excluded.expires_at,
          completed_at = null,
          updated_at = now()
      `;
    } catch (error) {
      await abortMultipartUpload(started.partBaseUrl, asset.s3_key).catch(() => undefined);
      throw error;
    }
    return {
      assetId: asset.id,
      alreadyVerified: false as const,
      uploadId: started.uploadId,
      partBaseUrl: started.partBaseUrl,
      expiresAt: expiresAt.getTime(),
    };
  });

export const resumeAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    if (asset.byte_size != null) return { alreadyVerified: true as const, completedParts: [] as number[] };
    const sql = await getSql();
    const rows = await sql<{
      upload_id: string; object_key: string; part_base_url_ciphertext: string;
      file_size: number; part_size: number; status: string; expires_at: string | Date;
    }>`
      select upload_id, object_key, part_base_url_ciphertext, file_size, part_size, status, expires_at
      from bridge_asset_multipart_sessions
      where asset_id = ${asset.id} and title_id = ${asset.title_id}
        and created_by = ${context.userId}
      limit 1
    `;
    const session = rows[0];
    if (!session || session.object_key !== asset.s3_key || session.status !== "active" ||
        new Date(session.expires_at).getTime() <= Date.now()) {
      throw new Error("No active resumable upload session exists for this asset");
    }
    const { listMultipartUploadParts } = await import("./oci-object-storage.server");
    const remote = await listMultipartUploadParts(session.object_key, session.upload_id);
    const total = Math.ceil(Number(session.file_size) / Number(session.part_size));
    const seen = new Set<number>();
    const completedParts: number[] = [];
    for (const part of remote) {
      const expectedSize = part.partNumber < total
        ? Number(session.part_size)
        : Number(session.file_size) - (total - 1) * Number(session.part_size);
      if (part.partNumber > total || part.size !== expectedSize || seen.has(part.partNumber)) {
        throw new Error("OCI parts do not match the saved upload manifest; refusing unsafe resume");
      }
      seen.add(part.partNumber);
      completedParts.push(part.partNumber);
    }
    return {
      alreadyVerified: false as const,
      uploadId: session.upload_id,
      partBaseUrl: decryptMultipartCapability(session.part_base_url_ciphertext),
      completedParts: completedParts.sort((a, b) => a - b),
      expiresAt: new Date(session.expires_at).getTime(),
      partSize: Number(session.part_size),
    };
  });

export const commitAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    if (asset.byte_size != null) return { committed: true };
    const sql = await getSql();
    const rows = await sql<{ part_base_url_ciphertext: string; object_key: string; status: string; expires_at: string | Date }>`
      select part_base_url_ciphertext, object_key, status, expires_at
      from bridge_asset_multipart_sessions
      where asset_id = ${asset.id} and title_id = ${asset.title_id} and created_by = ${context.userId}
      limit 1
    `;
    const session = rows[0];
    if (!session || session.object_key !== asset.s3_key) throw new Error("Multipart session not found");
    if (session.status === "committed") return { committed: true };
    if (session.status !== "active" || new Date(session.expires_at).getTime() <= Date.now()) {
      throw new Error("Multipart session is not active or has expired");
    }
    const claimed = await sql<{ asset_id: string }>`
      update bridge_asset_multipart_sessions set status = 'committing', updated_at = now()
      where asset_id = ${asset.id} and created_by = ${context.userId} and status = 'active'
      returning asset_id
    `;
    if (!claimed[0]) throw new Error("Multipart session is already being committed; refresh before retrying");
    try {
      const { commitMultipartUpload } = await import("./oci-object-storage.server");
      await commitMultipartUpload(decryptMultipartCapability(session.part_base_url_ciphertext), asset.s3_key);
      await sql`
        update bridge_asset_multipart_sessions
        set status = 'committed', completed_at = now(), updated_at = now()
        where asset_id = ${asset.id} and created_by = ${context.userId} and status = 'committing'
      `;
      return { committed: true };
    } catch (error) {
      await sql`
        update bridge_asset_multipart_sessions set status = 'active', updated_at = now()
        where asset_id = ${asset.id} and created_by = ${context.userId} and status = 'committing'
      `;
      throw error;
    }
  });

export const abortAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    const sql = await getSql();
    const rows = await sql<{ part_base_url_ciphertext: string; object_key: string; status: string }>`
      select part_base_url_ciphertext, object_key, status
      from bridge_asset_multipart_sessions
      where asset_id = ${asset.id} and title_id = ${asset.title_id} and created_by = ${context.userId}
      limit 1
    `;
    const session = rows[0];
    if (!session || session.object_key !== asset.s3_key) return { aborted: true };
    if (session.status === "aborted") return { aborted: true };
    if (session.status !== "active") throw new Error("Multipart session cannot be aborted in its current state");
    const { abortMultipartUpload } = await import("./oci-object-storage.server");
    await abortMultipartUpload(decryptMultipartCapability(session.part_base_url_ciphertext), asset.s3_key);
    await sql`
      update bridge_asset_multipart_sessions set status = 'aborted', updated_at = now()
      where asset_id = ${asset.id} and created_by = ${context.userId} and status = 'active'
    `;
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
    if (!asset) throw new Error("Asset not found");
    const title = await loadTitle(asset.title_id);
    if (!title || !canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload") || !UPLOADABLE.has(title.status)) {
      throw new Error("Upload confirmation is closed for this title");
    }
    if (asset.byte_size != null)
      return { assetId: asset.id, byteSize: Number(asset.byte_size), verified: true };

    const { verifyObject, hashObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    const object = await verifyObject(asset.s3_key, asset.content_type);
    if (data.expectedByteSize != null && object.byteSize !== data.expectedByteSize) {
      throw new Error("Uploaded object size does not match the file that was sent");
    }
    if (!object.etag) throw new Error("Object ETag is required for immutable verification");
    // Use the immutable asset row ID, not a per-request UUID. If a browser timeout
    // leads to a duplicate confirmation while the first server call is still running,
    // both attempts target the same sealed object instead of creating orphan copies.
    const sealedKey = `${asset.s3_key}.verified/${asset.id}`;
    const sourceDigest = await hashObject(asset.s3_key);
    if (sourceDigest.byteSize !== object.byteSize) {
      throw new Error("Uploaded object changed during source checksum verification");
    }
    const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, object.etag);
    if (sealed.byteSize !== object.byteSize || !sealed.etag) {
      throw new Error("Verified copy differs from the uploaded object");
    }
    const sealedDigest = await hashObject(sealedKey);
    if (sealedDigest.byteSize !== sourceDigest.byteSize || sealedDigest.sha256 !== sourceDigest.sha256) {
      throw new Error("Immutable copy SHA-256 does not match the uploaded source");
    }
    // Persist asset/title/audit state first. Do not advance the migration queue
    // if persistence fails: its prior state remains the truthful state.
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: asset.id,
      actorUserId: actor.userId,
      internalActor: Boolean(actor.internalRole),
      titleId: title.id,
      kind: asset.kind,
      byteSize: sealed.byteSize,
      contentType: sealed.contentType,
      checksum: `sha256:${sourceDigest.sha256}`,
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
