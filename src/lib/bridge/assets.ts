import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
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
    const diagnosticStartedAt = Date.now();
    let diagnosticStage = "authentication";
    const diagnosticAssetId = data.assetId;
    try {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "asset.sign_upload");
    diagnosticStage = "database_asset_lookup";
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

    const startTime = Date.now();
    const { verifyObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    diagnosticStage = "oci_source_head_verification";

    // Stage 1: Verify uploaded source object in OCI
    let object: Awaited<ReturnType<typeof verifyObject>>;
    try {
      object = await verifyObject(asset.s3_key, asset.content_type);
    } catch (err) {
      console.error("[bridge-asset-confirmation] source head verification failed", {
        stage: "SOURCE_HEAD",
        assetId: asset.id,
        titleId: title.id,
        kind: asset.kind,
        elapsedMs: Date.now() - startTime,
        errorCategory: "SOURCE_HEAD_FAILED",
        httpStatus: (err as { status?: number })?.status ?? null,
        ociRequestId: (err as { requestId?: string | null })?.requestId ?? null,
        error: (err as Error).message,
      });
      throw err;
    }

    // Stage 2: Metadata validation (byte size and ETag)
    if (data.expectedByteSize != null && object.byteSize !== data.expectedByteSize) {
      console.error("[bridge-asset-confirmation] metadata size mismatch", {
        stage: "METADATA_VALIDATION",
        assetId: asset.id,
        titleId: title.id,
        kind: asset.kind,
        elapsedMs: Date.now() - startTime,
        errorCategory: "METADATA_SIZE_MISMATCH",
        expectedByteSize: data.expectedByteSize,
        actualByteSize: object.byteSize,
      });
      throw new Error("Uploaded object size does not match the file that was sent");
    }
    if (!object.etag) throw new Error("Object ETag is required for immutable verification");

    // Stage 3: Immutable seal copy in OCI
    const sealedKey = `${asset.s3_key}.verified/${asset.id}`;
    diagnosticStage = "oci_immutable_copy_and_destination_head";
    let sealed: Awaited<ReturnType<typeof sealVerifiedObject>>;
    try {
      sealed = await sealVerifiedObject(asset.s3_key, sealedKey, object.etag);
    } catch (err) {
      console.error("[bridge-asset-confirmation] immutable seal failed", {
        stage: "IMMUTABLE_SEAL",
        assetId: asset.id,
        titleId: title.id,
        kind: asset.kind,
        elapsedMs: Date.now() - startTime,
        errorCategory: (err as { isTimeout?: boolean })?.isTimeout ? "OCI_POLL_TIMEOUT" : "SEAL_COPY_FAILED",
        httpStatus: (err as { status?: number })?.status ?? null,
        ociRequestId: (err as { requestId?: string | null })?.requestId ?? null,
        workRequestId: (err as { workRequestId?: string | null })?.workRequestId ?? null,
        terminalStatus: (err as { lastStatus?: string | null })?.lastStatus ?? null,
        error: (err as Error).message,
      });
      throw err;
    }

    if (sealed.byteSize !== object.byteSize || !sealed.etag) {
      console.error("[bridge-asset-confirmation] destination head verification mismatch", {
        stage: "DESTINATION_HEAD",
        assetId: asset.id,
        titleId: title.id,
        kind: asset.kind,
        elapsedMs: Date.now() - startTime,
        errorCategory: "SEALED_COPY_MISMATCH",
        sourceByteSize: object.byteSize,
        sealedByteSize: sealed.byteSize,
      });
      throw new Error("Verified copy differs from the uploaded object");
    }

    // Stage 4: Database persistence and audit logging
    // The legacy Loop migration queue has a different schema and lifecycle contract.
    // Canonical Bridge verification is persisted atomically in bridge_assets and bridge_audit_logs.
    diagnosticStage = "database_persist_verified_asset";
    let confirmed = false;
    try {
      confirmed = await persistVerifiedAsset(sql, {
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
    } catch (err) {
      console.error("[bridge-asset-confirmation] database persistence error", {
        stage: "DB_PERSISTENCE",
        assetId: asset.id,
        titleId: title.id,
        kind: asset.kind,
        elapsedMs: Date.now() - startTime,
        errorCategory: "DB_PERSISTENCE_ERROR",
        error: (err as Error).message,
      });
      throw err;
    }

    if (confirmed) {
      console.log("[bridge-asset-confirmation] asset verification completed", {
        stage: "COMPLETED",
        assetId: asset.id,
        titleId: title.id,
        kind: asset.kind,
        byteSize: sealed.byteSize,
        contentType: sealed.contentType,
        elapsedMs: Date.now() - startTime,
        dbPersisted: true,
      });
    } else {
      const current = await sql<{
        byte_size: number | null;
      }>`select byte_size from bridge_assets where id = ${asset.id}`;
      if (current[0]?.byte_size != null) {
        console.log("[bridge-asset-confirmation] asset already verified concurrently", {
          stage: "COMPLETED",
          assetId: asset.id,
          titleId: title.id,
          kind: asset.kind,
          byteSize: Number(current[0].byte_size),
          elapsedMs: Date.now() - startTime,
          dbPersisted: true,
        });
        return { assetId: asset.id, byteSize: Number(current[0].byte_size), verified: true };
      }
      console.error("[bridge-asset-confirmation] asset persistence failed (state changed)", {
        stage: "DB_PERSISTENCE",
        assetId: asset.id,
        titleId: title.id,
        kind: asset.kind,
        elapsedMs: Date.now() - startTime,
        errorCategory: "DB_PERSISTENCE_FAILED",
        dbPersisted: false,
      });
      throw new Error("Asset confirmation changed; retry after refreshing the title");
    }
    return { assetId: asset.id, byteSize: sealed.byteSize, verified: true };
    } catch (error) {
      // Emit only safe diagnostics: never log request payloads, object keys, signed URLs,
      // credentials, private keys, or raw provider error messages.
      const raw = error instanceof Error ? error.message : "";
      const statusMatch = raw.match(/\((\d{3})\)/);
      const category =
        /database|postgres|sql|connection|pool/i.test(raw) || diagnosticStage.startsWith("database")
          ? "database_persistence_failure"
          : /oci|object|copy|work-request|etag|content type|uploaded object/i.test(raw) || diagnosticStage.startsWith("oci")
            ? "oci_verification_failure"
            : "request_or_authorization_failure";
      console.error("[bridge-upload] confirmAssetUpload failed", {
        stage: diagnosticStage,
        category,
        httpStatus: statusMatch ? Number(statusMatch[1]) : null,
        elapsedMs: Date.now() - diagnosticStartedAt,
        assetId: /^[a-f0-9-]{8,64}$/i.test(diagnosticAssetId) ? diagnosticAssetId : "redacted",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
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
