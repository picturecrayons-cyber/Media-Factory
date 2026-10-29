import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
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
      originalFilename: z.string().trim().min(1).max(255).optional(),
      contentType: z.string().min(3).max(120),
      replacesAssetId: z.string().min(8).optional(),
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
    if (data.kind === "censor_certificate" && !/^.+\.(pdf|png|jpe?g)$/i.test(data.filename)) {
      throw new Error("Censor certificate must be a PDF, PNG or JPEG image");
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
    let replacesAssetId: string | null = null;
    if (data.kind === "censor_certificate" && data.replacesAssetId) {
      const sql = await getSql();
      const previousRows = await sql<{
        id: string; title_id: string; kind: string; byte_size: number | null;
        asset_version_id: string | null;
      }>`select id, title_id, kind, byte_size, asset_version_id
        from bridge_assets a
        where id = ${data.replacesAssetId}
          and not exists (
            select 1 from bridge_assets successor
            where successor.supersedes_asset_id = a.id
              and successor.kind = 'censor_certificate'
              and successor.certificate_duplicate_of_asset_id is null
          )
        limit 1`;
      const previous = previousRows[0];
      if (!previous || previous.title_id !== title.id || previous.kind !== "censor_certificate" || previous.byte_size == null) {
        throw new Error("The certificate selected for replacement is not eligible");
      }
      replacesAssetId = previous.id;
    }
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
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by,
        original_filename, replacement_requested_asset_id)
      values (${id}, ${title.id}, ${data.kind}, ${key}, ${data.contentType}, ${actor.userId},
        ${data.originalFilename ?? data.filename}, ${replacesAssetId})
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.upload_signed",
      entityType: "bridge_asset",
      entityId: id,
      metadata: { titleId: title.id, kind: data.kind, originalFilename: data.originalFilename ?? data.filename, replacesAssetId },
    });
    return { assetId: id, url: signed.url, method: signed.method };
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
      original_filename: string | null;
      replacement_requested_asset_id: string | null;
      asset_version_id: string | null;
      sha256: string | null;
      certificate_duplicate_of_asset_id: string | null;
    }>`
      select id, title_id, kind, s3_key, created_by, content_type, byte_size,
        original_filename, replacement_requested_asset_id, asset_version_id,
        sha256, certificate_duplicate_of_asset_id
      from bridge_assets where id = ${data.assetId} limit 1
    `;
    const asset = rows[0];
    if (!asset) throw new Error("Asset not found");
    const title = await loadTitle(asset.title_id);
    if (!title || !canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload") || !UPLOADABLE.has(title.status)) {
      throw new Error("Upload confirmation is closed for this title");
    }
    const alreadyVerified = asset.byte_size != null;
    if (alreadyVerified && asset.kind !== "censor_certificate")
      return { assetId: asset.id, byteSize: Number(asset.byte_size), verified: true };
    if (alreadyVerified && asset.sha256 && asset.asset_version_id) {
      await sql`
        update loop_media_migration_queue
        set status = 'UPLOADED', target_path = ${asset.s3_key}, updated_at = now()
        where title_id = ${title.id}
          and asset_kind = case when ${asset.kind} = 'screener' then 'TRAILER' else upper(${asset.kind}) end
          and status in ('QUEUED', 'STAGED', 'PROCESSING', 'FAILED', 'UPLOADED')
      `;
      await sql`
        update loop_media_migration_queue
        set status = 'VERIFIED', target_path = ${asset.s3_key}, updated_at = now()
        where title_id = ${title.id}
          and asset_kind = case when ${asset.kind} = 'screener' then 'TRAILER' else upper(${asset.kind}) end
          and status in ('UPLOADED', 'QUEUED', 'STAGED', 'PROCESSING', 'FAILED')
      `;
      return {
        assetId: asset.id,
        byteSize: Number(asset.byte_size),
        verified: true,
        sha256: asset.sha256,
        duplicate: Boolean(asset.certificate_duplicate_of_asset_id),
        versionId: asset.asset_version_id,
      };
    }

    const { verifyObject, sealVerifiedObject, signDownload } = await import("./oci-object-storage.server");
    let sealedKey = asset.s3_key;
    let sealed: { byteSize: number; contentType: string | null; etag: string | null };
    if (alreadyVerified) {
      // Recover a prior verification whose SHA/version metadata was interrupted.
      sealed = {
        byteSize: Number(asset.byte_size),
        contentType: asset.content_type || "application/octet-stream",
        etag: null,
      };
      if (data.expectedByteSize != null && sealed.byteSize !== data.expectedByteSize)
        throw new Error("Verified asset size does not match the requested file size");
      if (asset.kind === "censor_certificate" && sealed.byteSize > 25 * 1024 * 1024)
        throw new Error("Censor certificate exceeds the 25 MB verification limit");
    } else {
      const object = await verifyObject(asset.s3_key, asset.content_type);
      if (data.expectedByteSize != null && object.byteSize !== data.expectedByteSize) {
        throw new Error("Uploaded object size does not match the file that was sent");
      }
      if (asset.kind === "censor_certificate" && object.byteSize > 25 * 1024 * 1024) {
        throw new Error("Censor certificate exceeds the 25 MB verification limit");
      }
      if (!object.etag) throw new Error("Object ETag is required for immutable verification");
      sealedKey = `${asset.s3_key}.verified/${asset.id}`;
      sealed = await sealVerifiedObject(asset.s3_key, sealedKey, object.etag);
      if (sealed.byteSize !== object.byteSize || !sealed.etag) {
        throw new Error("Verified copy differs from the uploaded object");
      }
    }
    // Persist asset/title/audit state first. Do not advance the migration queue
    // if persistence fails: its prior state remains the truthful state.
    let certificateSha256: string | null = null;
    const certificateFilename = asset.original_filename ??
      (asset.s3_key.split(".verified/")[0].split("/").pop() || "Legacy certificate");
    if (asset.kind === "censor_certificate") {
      const signedRead = await signDownload({ key: sealedKey, expiresIn: 300 });
      const response = await fetch(signedRead.url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok || !response.body) throw new Error("Could not read certificate bytes for SHA-256 verification");
      const hash = createHash("sha256");
      let totalBytes = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          const chunk = next.value;
          totalBytes += chunk.byteLength;
          if (totalBytes > 25 * 1024 * 1024) throw new Error("Censor certificate exceeds the 25 MB verification limit");
          hash.update(chunk);
        }
      } finally {
        reader.releaseLock();
      }
      if (totalBytes !== sealed.byteSize) throw new Error("Certificate byte count changed during SHA-256 verification");
      certificateSha256 = hash.digest("hex");
    }
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: asset.id,
      actorUserId: actor.userId,
      internalActor: Boolean(actor.internalRole),
      titleId: title.id,
      kind: asset.kind,
      byteSize: sealed.byteSize,
      contentType: sealed.contentType,
      checksum: certificateSha256 ?? sealed.etag,
      sourceKey: asset.s3_key,
      sealedKey,
    });
    const concurrentlyPersisted = !confirmed && !alreadyVerified && asset.kind === "censor_certificate"
      ? (await sql<{ byte_size: number | null }>`
          select byte_size from bridge_assets where id = ${asset.id} limit 1
        `)[0]?.byte_size != null
      : false;
    const canFinalizeCertificate = asset.kind === "censor_certificate" && certificateSha256 &&
      (alreadyVerified || confirmed || concurrentlyPersisted);
    if (canFinalizeCertificate) {
      const certificateResult = await sql.transaction(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext(${title.id})::bigint)`;
        const lockedAsset = (await tx<{
          sha256: string | null;
          asset_version_id: string | null;
          certificate_duplicate_of_asset_id: string | null;
        }>`select sha256, asset_version_id, certificate_duplicate_of_asset_id
            from bridge_assets where id = ${asset.id} for update`)[0];
        if (lockedAsset?.sha256 && lockedAsset.asset_version_id) {
          const existingVersion = await tx<{ version: number }>`
            select version from bridge_asset_versions where id = ${lockedAsset.asset_version_id}::uuid limit 1
          `;
          return {
            duplicateOf: lockedAsset.certificate_duplicate_of_asset_id,
            version: Number(existingVersion[0]?.version ?? 1),
            alreadySaved: true,
          };
        }
        const duplicateRows = await tx<{ id: string; canonical_id: string | null }>`
          select id, certificate_duplicate_of_asset_id as canonical_id
          from bridge_assets
          where title_id = ${title.id} and kind = 'censor_certificate'
            and sha256 = ${certificateSha256} and id <> ${asset.id}
          order by created_at asc limit 1
        `;
        const duplicateOf = duplicateRows[0]
          ? (duplicateRows[0].canonical_id ?? duplicateRows[0].id)
          : null;
        const versionRows = await tx<{ next_version: number }>`
          select coalesce(max(version), 0) + 1 as next_version
          from bridge_asset_versions
          where title_id = ${title.id} and asset_type = 'CENSOR_CERTIFICATE' and language = 'und'
        `;
        const nextVersion = Number(versionRows[0]?.next_version ?? 1);
        const referenceRows = await tx<{ id: string | null }>`
          select asset_version_id as id
          from bridge_assets
          where id = ${asset.replacement_requested_asset_id ?? ""}
            and kind = 'censor_certificate' and title_id = ${title.id}
          limit 1
        `;
        const referenceVersionId = referenceRows[0]?.id ?? null;
        const newVersionId = (await tx<{ id: string }>`
          insert into bridge_asset_versions (
            id, title_id, asset_group, asset_type, version, language,
            reference_asset_id, s3_key, checksum_sha256, byte_size,
            technical_metadata, processing_state, created_by
          ) values (
            gen_random_uuid(), ${title.id}, 'DOCUMENT', 'CENSOR_CERTIFICATE', ${nextVersion}, 'und',
            ${referenceVersionId}::uuid, ${sealedKey}, ${certificateSha256}, ${sealed.byteSize},
            ${JSON.stringify({ originalFilename: certificateFilename, duplicateOfAssetId: duplicateOf })}::jsonb,
            ${duplicateOf ? "WARNING" : "PASSED"}, ${actor.userId}
          ) returning id
        `)[0]?.id;
        if (!newVersionId) throw new Error("Could not persist certificate version history");
        await tx`
          update bridge_assets
          set original_filename = coalesce(original_filename, ${certificateFilename}),
              sha256 = ${certificateSha256},
              asset_version_id = ${newVersionId},
              certificate_duplicate_of_asset_id = ${duplicateOf},
              supersedes_asset_id = case when ${duplicateOf} is null then replacement_requested_asset_id else null end
          where id = ${asset.id} and kind = 'censor_certificate'
        `;
        return { duplicateOf, version: nextVersion, alreadySaved: false };
      });
      if (!certificateResult.alreadySaved && certificateResult.duplicateOf) {
        await writeAudit({
          actorUserId: actor.userId,
          action: "asset.censor_certificate_duplicate_detected",
          entityType: "bridge_asset",
          entityId: asset.id,
          metadata: { titleId: title.id, duplicateOfAssetId: certificateResult.duplicateOf, sha256: certificateSha256, version: certificateResult.version },
        });
      } else if (!certificateResult.alreadySaved && asset.replacement_requested_asset_id) {
        await writeAudit({
          actorUserId: actor.userId,
          action: "asset.censor_certificate_replaced",
          entityType: "bridge_asset",
          entityId: asset.id,
          metadata: { titleId: title.id, supersedesAssetId: asset.replacement_requested_asset_id, sha256: certificateSha256, version: certificateResult.version },
        });
      }
    }
    if (confirmed || (alreadyVerified && asset.kind === "censor_certificate")) {
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
  .validator(z.object({
    assetId: z.string().min(8),
    purpose: z.enum(["download", "preview"]).optional().default("download"),
  }))
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
    if (asset.kind === "censor_certificate" && (
      (actor.accountType === "buyer" && !actor.internalRole) ||
      (!actor.internalRole && title.ownerUserId !== actor.userId)
    )) {
      await writeAudit({
        actorUserId: actor.userId,
        action: "asset.censor_certificate_access_denied",
        entityType: "bridge_asset",
        entityId: asset.id,
        metadata: { titleId: title.id, reason: "certificate_requires_owner_or_permitted_staff" },
      });
      throw new Error("Not found");
    }
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
    const signed = asset.kind === "censor_certificate"
      ? await signDownload({ key: asset.s3_key, expiresIn: 300 })
      : await signDownload({ key: asset.s3_key });
    await writeAudit({
      actorUserId: actor.userId,
      action: asset.kind === "censor_certificate" && data.purpose === "preview"
        ? "asset.censor_certificate_preview_signed"
        : "asset.download_signed",
      entityType: "bridge_asset",
      entityId: asset.id,
    });
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
      id: string;
      kind: string;
      s3_key: string;
      content_type: string | null;
      byte_size: number | null;
      created_at: string | Date;
      original_filename: string | null;
      sha256: string | null;
      supersedes_asset_id: string | null;
      certificate_duplicate_of_asset_id: string | null;
      asset_version_number: number | null;
      version_processing_state: string | null;
    }>`
      select a.id, a.kind, a.s3_key, a.content_type, a.byte_size, a.created_at,
        a.original_filename, a.sha256, a.supersedes_asset_id, a.certificate_duplicate_of_asset_id,
        v.version as asset_version_number, v.processing_state as version_processing_state
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
          key: null,
          contentType: r.content_type,
          byteSize: r.byte_size,
          filename: r.original_filename ?? r.s3_key.split(".verified/")[0].split("/").pop() ?? null,
          sha256: r.kind === "censor_certificate" ? r.sha256 : null,
          supersedesAssetId: r.supersedes_asset_id,
          duplicateOfAssetId: r.certificate_duplicate_of_asset_id,
          version: r.kind === "censor_certificate" ? r.asset_version_number : null,
          versionState: r.kind === "censor_certificate" ? r.version_processing_state : null,
          verified: Number(r.byte_size) > 0,
          createdAt:
            r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
    };
  });
