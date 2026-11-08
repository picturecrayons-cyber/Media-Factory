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
import { validatePartManifest } from "./upload-manifest.ts";

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
    const sql = await getSql();
    const sessionActor = await requireVerifiedActor(context.userId);
    const { assertMultipartSessionSigningReady, signMultipartSession } = await import("./multipart-session.server");
    assertMultipartSessionSigningReady();
    // Reuse the currently active server session for this asset/size. Browser storage is
    // only a convenience; the durable session and part manifest live in bridge_private.
    const active = await sql<{
      id: string; provider_upload_id: string; part_base_url: string; expires_at: string | Date;
    }>`
      select id, provider_upload_id, part_base_url, expires_at
      from bridge_private.upload_sessions
      where asset_id = ${asset.id} and actor_user_id = ${context.userId}
        and expected_size = ${data.byteSize}
        and state in ('initiated','uploading') and expires_at > now()
      order by created_at desc limit 1
    `;
    const expiresIn = uploadUrlLifetimeSeconds(data.byteSize);
    const expiresAt = active[0] ? new Date(active[0].expires_at).getTime() : Date.now() + expiresIn * 1000;
    let sessionId: string;
    let uploadId: string;
    let partBaseUrl: string;
    if (active[0]) {
      sessionId = active[0].id;
      uploadId = active[0].provider_upload_id;
      partBaseUrl = active[0].part_base_url;
    } else {
      const { beginMultipartUpload, storageTarget } = await import("./oci-object-storage.server");
      const started = await beginMultipartUpload({
        key: asset.s3_key,
        contentType: asset.content_type || "application/octet-stream",
        expiresIn,
      });
      const target = await storageTarget();
      sessionId = randomBytes(16).toString("hex");
      uploadId = started.uploadId;
      partBaseUrl = started.partBaseUrl;
      await sql`
        insert into bridge_private.upload_sessions
          (id, asset_id, actor_user_id, actor_is_internal, provider, bucket, namespace, region, endpoint,
           source_object_key, provider_upload_id, part_base_url, expected_size, part_size,
           idempotency_key, expires_at)
        values
          (${sessionId}, ${asset.id}, ${context.userId}, ${Boolean(sessionActor.internalRole)}, ${target.provider}, ${target.bucket},
           ${target.namespace}, ${target.region}, ${target.endpoint}, ${asset.s3_key},
           ${uploadId}, ${partBaseUrl}, ${data.byteSize}, 16777216,
           ${randomBytes(16).toString("hex")}, to_timestamp(${expiresAt / 1000}))
      `;
    }
    const sessionToken = signMultipartSession({
      sessionId,
      actorUserId: context.userId,
      assetId: asset.id,
      objectKey: asset.s3_key,
      uploadId,
      partBaseUrl,
      expiresAt,
    });
    await writeAudit({
      actorUserId: context.userId,
      action: "asset.multipart_started",
      entityType: "bridge_asset",
      entityId: asset.id,
      metadata: { titleId: asset.title_id, byteSize: data.byteSize, sessionId },
    });
    return { assetId: asset.id, sessionId, alreadyVerified: false as const, uploadId, partBaseUrl, sessionToken, expiresAt };
  });

export const recordAssetMultipartPart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    assetId: z.string().min(8),
    sessionId: z.string().min(8),
    sessionToken: z.string().min(32).max(12000),
    partNumber: z.number().int().positive().max(10000),
    byteStart: z.number().int().nonnegative(),
    byteEnd: z.number().int().positive(),
    etag: z.string().min(1).max(512),
  }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    const { verifyMultipartSession } = await import("./multipart-session.server");
    const claims = verifyMultipartSession(data.sessionToken, {
      sessionId: data.sessionId, actorUserId: context.userId, assetId: asset.id, objectKey: asset.s3_key,
    });
    const sql = await getSql();
    const sessions = await sql<{
      expected_size: number; part_size: number; provider_upload_id: string; state: string;
    }>`
      select expected_size, part_size, provider_upload_id, state
      from bridge_private.upload_sessions
      where id = ${data.sessionId} and asset_id = ${asset.id}
        and actor_user_id = ${context.userId} and expires_at > now()
      limit 1
    `;
    const session = sessions[0];
    if (!session || claims.uploadId !== session.provider_upload_id || !["initiated","uploading"].includes(session.state)) throw new Error("Multipart session is not active or does not match its provider upload");
    if (data.byteEnd > Number(session.expected_size) || data.byteEnd <= data.byteStart) throw new Error("Part byte range is invalid");
    // Do not list every OCI part for every uploaded part. That creates O(n²)
    // provider-list traffic for large masters. Persist the client-observed ETag
    // after strict range validation; commitAssetMultipart performs one complete
    // provider listing and compares every saved ETag/size before assembly.
    const expectedSize = Number(session.expected_size);
    const partSize = Number(session.part_size);
    const expectedStart = (data.partNumber - 1) * partSize;
    const expectedEnd = Math.min(expectedSize, expectedStart + partSize);
    const normalizedEtag = data.etag.replaceAll('"', "");
    if (
      data.partNumber > Math.ceil(expectedSize / partSize) ||
      data.byteStart !== expectedStart ||
      data.byteEnd !== expectedEnd ||
      !normalizedEtag ||
      normalizedEtag.length > 512 ||
      /[\\r\\n]/.test(normalizedEtag)
    ) {
      throw new Error("Part number, byte range or ETag is invalid for this upload session");
    }
    await sql`
      insert into bridge_private.upload_parts (session_id, part_number, byte_start, byte_end, etag)
      values (${data.sessionId}, ${data.partNumber}, ${data.byteStart}, ${data.byteEnd}, ${normalizedEtag})
      on conflict (session_id, part_number) do update
        set byte_start = excluded.byte_start, byte_end = excluded.byte_end,
            etag = excluded.etag, recorded_at = now()
    `;
    await sql`update bridge_private.upload_sessions set state='uploading', updated_at=now() where id=${data.sessionId}`;
    return { recorded: true, partNumber: data.partNumber };
  });

export const getAssetMultipartStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    assetId: z.string().min(8), sessionId: z.string().min(8),
    sessionToken: z.string().min(32).max(12000),
  }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    const { verifyMultipartSession } = await import("./multipart-session.server");
    verifyMultipartSession(data.sessionToken, {
      sessionId: data.sessionId, actorUserId: context.userId, assetId: asset.id, objectKey: asset.s3_key,
    });
    const sql = await getSql();
    const sessions = await sql<{ state: string }>`
      select state from bridge_private.upload_sessions
      where id=${data.sessionId} and asset_id=${asset.id}
        and actor_user_id=${context.userId} and expires_at > now()
      limit 1
    `;
    const session = sessions[0];
    if (!session) throw new Error("Durable multipart session was not found or has expired");
    const parts = await sql<{ part_number: number }>`
      select part_number from bridge_private.upload_parts where session_id=${data.sessionId}
      order by part_number
    `;
    return {
      state: session.state,
      completedParts: parts.map((part) => Number(part.part_number)),
      committed: ["assembling","verification_pending","verified"].includes(session.state),
    };
  });

export const commitAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    assetId: z.string().min(8), sessionId: z.string().min(8),
    sessionToken: z.string().min(32).max(12000),
  }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    if (asset.byte_size != null) return { committed: true };
    const { verifyMultipartSession } = await import("./multipart-session.server");
    const sessionClaims = verifyMultipartSession(data.sessionToken, {
      sessionId: data.sessionId, actorUserId: context.userId, assetId: asset.id, objectKey: asset.s3_key,
    });
    const sql = await getSql();
    const sessions = await sql<{
      expected_size: number; part_size: number; provider_upload_id: string; part_base_url: string; state: string;
    }>`
      select expected_size, part_size, provider_upload_id, part_base_url, state
      from bridge_private.upload_sessions
      where id = ${data.sessionId} and asset_id = ${asset.id}
        and actor_user_id = ${context.userId} and expires_at > now()
      limit 1
    `;
    const stored = sessions[0];
    if (!stored || sessionClaims.uploadId !== stored.provider_upload_id || sessionClaims.partBaseUrl !== stored.part_base_url || !["uploading","initiated","assembling"].includes(stored.state)) throw new Error("Multipart session cannot be committed");
    const savedParts = await sql<{
      part_number: number; byte_start: number; byte_end: number; etag: string;
    }>`
      select part_number, byte_start, byte_end, etag
      from bridge_private.upload_parts where session_id = ${data.sessionId}
      order by part_number
    `;
    const manifest = validatePartManifest(savedParts.map((part) => ({
      partNumber: Number(part.part_number), byteStart: Number(part.byte_start),
      byteEnd: Number(part.byte_end), etag: part.etag,
    })), { expectedSize: Number(stored.expected_size), partSize: Number(stored.part_size) });
    const { listMultipartUploadParts, commitMultipartUpload } = await import("./oci-object-storage.server");
    const providerParts = await listMultipartUploadParts(asset.s3_key, stored.provider_upload_id);
    if (providerParts.length !== manifest.length || manifest.some((part) => {
      const actual = providerParts.find((candidate) => candidate.partNumber === part.partNumber);
      return !actual || actual.etag !== part.etag.replaceAll('"', "") || actual.size !== part.byteEnd - part.byteStart;
    })) {
      throw new Error("Persisted part manifest does not match OCI's current multipart parts");
    }
    await sql`update bridge_private.upload_sessions set state='assembling', updated_at=now() where id=${data.sessionId}`;
    await commitMultipartUpload(sessionClaims.partBaseUrl, asset.s3_key, manifest);
    await sql`
      update bridge_private.upload_sessions set state='verification_pending', updated_at=now()
      where id=${data.sessionId}
    `;
    await sql`
      insert into bridge_private.asset_verification_jobs (asset_id, session_id)
      values (${asset.id}, ${data.sessionId})
      on conflict (session_id) do nothing
    `;
    await writeAudit({
      actorUserId: context.userId, action: "asset.multipart_committed",
      entityType: "bridge_asset", entityId: asset.id, metadata: { sessionId: data.sessionId },
    });
    return { committed: true, verificationQueued: true };
  });

export const abortAssetMultipart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8), sessionId: z.string().min(8), sessionToken: z.string().min(32).max(12000) }))
  .handler(async ({ context, data }) => {
    const asset = await openUploadAsset(context.userId, data.assetId);
    if (asset.byte_size != null) throw new Error("A verified asset cannot be aborted");
    const { verifyMultipartSession } = await import("./multipart-session.server");
    const session = verifyMultipartSession(data.sessionToken, {
      sessionId: data.sessionId, actorUserId: context.userId, assetId: asset.id, objectKey: asset.s3_key,
    });
    const sql = await getSql();
    const active = await sql<{ provider_upload_id: string; state: string }>`
      select provider_upload_id,state from bridge_private.upload_sessions
      where id=${data.sessionId} and asset_id=${asset.id} and actor_user_id=${context.userId} limit 1
    `;
    if (!active[0] || active[0].provider_upload_id !== session.uploadId ||
        !["initiated","uploading"].includes(active[0].state)) throw new Error("Multipart session cannot be aborted");
    const { abortMultipartUpload } = await import("./oci-object-storage.server");
    await abortMultipartUpload(session.partBaseUrl, asset.s3_key);
    await sql`update bridge_private.upload_sessions set state='aborted', updated_at=now() where id=${data.sessionId}`;
    await writeAudit({
      actorUserId: context.userId,
      action: "asset.multipart_aborted",
      entityType: "bridge_asset",
      entityId: asset.id,
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
    if (!asset) throw new Error("Asset not found");
    const title = await loadTitle(asset.title_id);
    if (!title || !canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload") || !UPLOADABLE.has(title.status)) {
      throw new Error("Upload confirmation is closed for this title");
    }
    if (asset.byte_size != null)
      return { assetId: asset.id, byteSize: Number(asset.byte_size), verified: true };

    const { verifyObject, sealVerifiedObject, computeObjectSha256, storageTarget } = await import("./oci-object-storage.server");
    const object = await verifyObject(asset.s3_key, asset.content_type);
    if (data.expectedByteSize != null && object.byteSize !== data.expectedByteSize) {
      throw new Error("Uploaded object size does not match the file that was sent");
    }
    if (!object.etag) throw new Error("Object ETag is required for immutable verification");
    // Use the immutable asset row ID, not a per-request UUID. If a browser timeout
    // leads to a duplicate confirmation while the first server call is still running,
    // both attempts target the same sealed object instead of creating orphan copies.
    const sealedKey = `${asset.s3_key}.verified/${asset.id}`;
    const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, object.etag);
    if (sealed.byteSize !== object.byteSize || !sealed.etag) {
      throw new Error("Verified copy differs from the uploaded object");
    }
    const checksumSha256 = await computeObjectSha256(sealedKey);
    if (!/^[a-f0-9]{64}$/.test(checksumSha256)) throw new Error("Storage SHA-256 verification returned an invalid digest");
    const storage = await storageTarget();
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
      checksum: sealed.etag,
      checksumSha256,
      storage,
      objectVersionId: sealed.versionId ?? null,
      sourceKey: asset.s3_key,
      sealedKey,
    });
    if (confirmed) {
      await sql`update bridge_private.upload_sessions set state='verified', updated_at=now() where asset_id=${asset.id} and state in ('assembling','verification_pending')`;
      await sql`update bridge_private.asset_verification_jobs set status='succeeded', locked_at=null, last_error=null, updated_at=now() where asset_id=${asset.id}`;
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
      verified_object_key: string | null;
      checksum_sha256: string | null;
      byte_size: number | null;
    }>`
      select id, title_id, kind, verified_object_key, checksum_sha256, byte_size
      from bridge_assets where id = ${data.assetId} and byte_size > 0
        and verified_object_key is not null and length(checksum_sha256) = 64
        and checksum_sha256 !~ '[^a-f0-9]' limit 1
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
    const { createAssetStreamToken } = await import("./asset-stream-token.server");
    const token = createAssetStreamToken(actor.userId, asset.id, 60);
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.download_signed",
      entityType: "bridge_asset",
      entityId: asset.id,
    });
    // Return only a short-lived Bridge stream capability. Never expose OCI PARs,
    // bucket names, or object keys to the browser or Buyer responses.
    return {
      url: `/api/assets/${asset.id}/stream?token=${encodeURIComponent(token)}`,
      method: "GET" as const,
    };
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
      id: string; kind: string; s3_key: string; content_type: string | null;
      byte_size: number | null; created_at: string | Date;
      storage_provider: string | null; storage_bucket: string | null;
      storage_namespace: string | null; storage_region: string | null;
      storage_endpoint: string | null; checksum_sha256: string | null;
      verified_object_key: string | null; object_version_id: string | null;
      object_generation: string | null; storage_verified_at: string | Date | null;
    }>`
      select id, kind, s3_key, content_type, byte_size, created_at,
        storage_provider, storage_bucket, storage_namespace, storage_region,
        storage_endpoint, checksum_sha256, verified_object_key, object_version_id,
        object_generation, storage_verified_at
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
          verified: Number(r.byte_size) > 0 && Boolean(r.verified_object_key && r.checksum_sha256),
          ...(buyer ? {} : {
            storageLocation: r.verified_object_key ? {
              provider: r.storage_provider,
              objectKey: r.verified_object_key,
              bucket: r.storage_bucket,
              namespace: r.storage_namespace,
              region: r.storage_region,
              endpoint: r.storage_endpoint,
              checksumSha256: r.checksum_sha256,
              objectVersionId: r.object_version_id,
              objectGeneration: r.object_generation,
              verifiedAt: r.storage_verified_at instanceof Date
                ? r.storage_verified_at.toISOString()
                : r.storage_verified_at ? String(r.storage_verified_at) : null,
            } : null,
          }),
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
    };
  });
 limit 1
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
    return { url: `/api/assets/${encodeURIComponent(asset.id)}/stream?token=${encodeURIComponent(token)}`, method: "GET" as const };
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
      id: string; kind: string; s3_key: string; content_type: string | null;
      byte_size: number | null; created_at: string | Date;
      storage_provider: string | null; storage_bucket: string | null;
      storage_namespace: string | null; storage_region: string | null;
      storage_endpoint: string | null; checksum_sha256: string | null;
      verified_object_key: string | null; object_version_id: string | null;
      object_generation: string | null; storage_verified_at: string | Date | null;
    }>`
      select id, kind, s3_key, content_type, byte_size, created_at,
        storage_provider, storage_bucket, storage_namespace, storage_region,
        storage_endpoint, checksum_sha256, verified_object_key, object_version_id,
        object_generation, storage_verified_at
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
          verified: Number(r.byte_size) > 0 && Boolean(r.verified_object_key && r.checksum_sha256),
          ...(buyer ? {} : {
            storageLocation: r.verified_object_key ? {
              provider: r.storage_provider,
              objectKey: r.verified_object_key,
              bucket: r.storage_bucket,
              namespace: r.storage_namespace,
              region: r.storage_region,
              endpoint: r.storage_endpoint,
              checksumSha256: r.checksum_sha256,
              objectVersionId: r.object_version_id,
              objectGeneration: r.object_generation,
              verifiedAt: r.storage_verified_at instanceof Date
                ? r.storage_verified_at.toISOString()
                : r.storage_verified_at ? String(r.storage_verified_at) : null,
            } : null,
          }),
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
    };
  });
 limit 1
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
    const signed = await signDownload({ key: asset.verified_object_key! });
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.download_signed",
      entityType: "bridge_asset",
      entityId: asset.id,
    });
    // Never return bucket names or object keys in the download response, including to Buyers.
    return { url: signed.url, method: signed.method };
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
      id: string; kind: string; s3_key: string; content_type: string | null;
      byte_size: number | null; created_at: string | Date;
      storage_provider: string | null; storage_bucket: string | null;
      storage_namespace: string | null; storage_region: string | null;
      storage_endpoint: string | null; checksum_sha256: string | null;
      verified_object_key: string | null; object_version_id: string | null;
      object_generation: string | null; storage_verified_at: string | Date | null;
    }>`
      select id, kind, s3_key, content_type, byte_size, created_at,
        storage_provider, storage_bucket, storage_namespace, storage_region,
        storage_endpoint, checksum_sha256, verified_object_key, object_version_id,
        object_generation, storage_verified_at
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
          verified: Number(r.byte_size) > 0 && Boolean(r.verified_object_key && r.checksum_sha256),
          ...(buyer ? {} : {
            storageLocation: r.verified_object_key ? {
              provider: r.storage_provider,
              objectKey: r.verified_object_key,
              bucket: r.storage_bucket,
              namespace: r.storage_namespace,
              region: r.storage_region,
              endpoint: r.storage_endpoint,
              checksumSha256: r.checksum_sha256,
              objectVersionId: r.object_version_id,
              objectGeneration: r.object_generation,
              verifiedAt: r.storage_verified_at instanceof Date
                ? r.storage_verified_at.toISOString()
                : r.storage_verified_at ? String(r.storage_verified_at) : null,
            } : null,
          }),
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
    };
  });
 limit 1
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
      id: string; kind: string; s3_key: string; content_type: string | null;
      byte_size: number | null; created_at: string | Date;
      storage_provider: string | null; storage_bucket: string | null;
      storage_namespace: string | null; storage_region: string | null;
      storage_endpoint: string | null; checksum_sha256: string | null;
      verified_object_key: string | null; object_version_id: string | null;
      object_generation: string | null; storage_verified_at: string | Date | null;
    }>`
      select id, kind, s3_key, content_type, byte_size, created_at,
        storage_provider, storage_bucket, storage_namespace, storage_region,
        storage_endpoint, checksum_sha256, verified_object_key, object_version_id,
        object_generation, storage_verified_at
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
          verified: Number(r.byte_size) > 0 && Boolean(r.verified_object_key && r.checksum_sha256),
          ...(buyer ? {} : {
            storageLocation: r.verified_object_key ? {
              provider: r.storage_provider,
              objectKey: r.verified_object_key,
              bucket: r.storage_bucket,
              namespace: r.storage_namespace,
              region: r.storage_region,
              endpoint: r.storage_endpoint,
              checksumSha256: r.checksum_sha256,
              objectVersionId: r.object_version_id,
              objectGeneration: r.object_generation,
              verifiedAt: r.storage_verified_at instanceof Date
                ? r.storage_verified_at.toISOString()
                : r.storage_verified_at ? String(r.storage_verified_at) : null,
            } : null,
          }),
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
    };
  });
