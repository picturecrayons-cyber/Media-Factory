import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { ditManifestDigest, ditManifestTotals, normalizeDitFiles } from "./dit-manifest";
import { bridgeEnv } from "./env";
import { sealVerifiedObject, signUpload, verifyObject, verifyObjectSha256 } from "./oci-object-storage.server";

const manifestFile = z.object({
  relativePath: z.string().min(1).max(1024),
  byteSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
const manifestInput = z.object({
  root: z.string().min(1).max(1000).optional(),
  files: z.array(manifestFile).min(1).max(10000),
});
const copyType = z.enum(["PRIMARY", "RECOVERY"]);
const createInput = z.object({
  titleId: z.string().min(8).max(160),
  cameraUnit: z.enum(["A", "B", "C"]),
  cameraLabel: z.string().trim().min(1).max(160),
  cardLabel: z.string().trim().min(1).max(120),
  shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceVolume: z.string().trim().min(1).max(160),
  sourceRoot: z.string().trim().min(1).max(1000),
  manifest: manifestInput,
});
const copyInput = z.object({
  sessionId: z.string().uuid(),
  copyType,
  copyRoot: z.string().trim().min(1).max(1000),
  manifest: manifestInput,
});
const uploadFileInput = z.object({
  sessionId: z.string().uuid(),
  relativePath: z.string().trim().min(1).max(1024),
});
const verifyFileInput = z.object({
  sessionId: z.string().uuid(),
  relativePath: z.string().trim().min(1).max(1024),
});
const signoffInput = z.object({
  sessionId: z.string().uuid(),
  signoffNote: z.string().trim().min(8).max(2000),
  folderStructurePreserved: z.literal(true),
  originalFilenamesPreserved: z.literal(true),
  cameraCardRetained: z.literal(true),
});

type DitRoleRow = { membership_role: string };
type SessionRow = {
  id: string;
  title_id: string;
  organization_id: string;
  camera_unit: string;
  camera_label: string;
  card_label: string;
  shoot_date: string;
  source_volume: string;
  source_root: string;
  source_manifest_sha256: string;
  source_file_count: number;
  source_total_bytes: number;
  status: string;
  signoff_note: string | null;
  created_at: string | Date;
  signed_off_at: string | Date | null;
};

async function requireDitOperator(userId: string) {
  const actor = await requireVerifiedActor(userId);
  if (actor.accountType !== "studio" || actor.internalRole || !actor.organizationId) {
    throw new Error("Verified Studio organization access is required for DIT operations");
  }
  const sql = await getSql();
  const roles = await sql<DitRoleRow>`
    select membership_role
    from bridge_organization_memberships
    where organization_id = ${actor.organizationId}
      and user_id = ${actor.userId}
      and status = 'active'
    limit 1
  `;
  if (!roles[0] || !["owner", "admin", "producer", "dit"].includes(roles[0].membership_role)) {
    throw new Error("An active Studio owner, admin, producer or DIT membership is required");
  }
  return actor;
}

async function requireStudioTitle(sql: Awaited<ReturnType<typeof getSql>>, titleId: string, organizationId: string) {
  const rows = await sql<{ id: string; name: string }>`
    select id, name
    from bridge_titles
    where id = ${titleId}
      and owner_account_type = 'studio'
      and (
        owner_organization_id = ${organizationId}
        or (
          owner_organization_id is null
          and exists (
            select 1 from bridge_profiles owner_profile
            where owner_profile.user_id = bridge_titles.owner_user_id
              and owner_profile.account_type = 'studio'
              and owner_profile.organization_id = ${organizationId}
          )
        )
      )
      and submission_type = 'finished_film'
      and merged_into_title_id is null
    limit 1
  `;
  if (!rows[0]) throw new Error("Finished film was not found in the active Studio organization");
  return rows[0];
}

async function requireSession(sql: Awaited<ReturnType<typeof getSql>>, sessionId: string, organizationId: string) {
  const rows = await sql<SessionRow>`
    select id, title_id, organization_id, camera_unit, camera_label, card_label, shoot_date,
      source_volume, source_root, source_manifest_sha256, source_file_count, source_total_bytes,
      status, signoff_note, created_at, signed_off_at
    from bridge_dit_ingest_sessions
    where id = ${sessionId}::uuid and organization_id = ${organizationId}
    limit 1
  `;
  if (!rows[0]) throw new Error("DIT ingest session was not found");
  return rows[0];
}

function audit(tx: Parameters<Parameters<Awaited<ReturnType<typeof getSql>>["transaction"]>[0]>[0], userId: string, action: string, entityId: string, metadata: object) {
  return tx`
    insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    values (${userId}, ${action}, 'bridge_dit_ingest_session', ${entityId}, ${JSON.stringify(metadata)})
  `;
}

export const getDitWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireDitOperator(context.userId);
    const sql = await getSql();
    const titles = await sql<{ id: string; name: string; status: string; year: number | null }>`
      select id, name, status, year
      from bridge_titles
      where owner_account_type = 'studio'
        and (
        owner_organization_id = ${actor.organizationId}
        or (
          owner_organization_id is null
          and exists (
            select 1 from bridge_profiles owner_profile
            where owner_profile.user_id = bridge_titles.owner_user_id
              and owner_profile.account_type = 'studio'
              and owner_profile.organization_id = ${actor.organizationId}
          )
        )
      )
        and submission_type = 'finished_film'
        and merged_into_title_id is null
      order by updated_at desc
      limit 200
    `;
    const sessions = await sql<SessionRow>`
      select s.id, s.title_id, s.organization_id, s.camera_unit, s.camera_label, s.card_label,
        s.shoot_date::text as shoot_date, s.source_volume, s.source_root,
        s.source_manifest_sha256, s.source_file_count, s.source_total_bytes, s.status,
        s.signoff_note, s.created_at, s.signed_off_at
      from bridge_dit_ingest_sessions s
      where s.organization_id = ${actor.organizationId}
      order by s.created_at desc
      limit 50
    `;
    const ids = sessions.map((session) => session.id);
    const copies = ids.length
      ? await sql<{
          id: string; session_id: string; copy_type: string; copy_root: string;
          manifest_sha256: string; file_count: number; total_bytes: number;
          verified: boolean; created_at: string | Date;
        }>`
          select id, session_id, copy_type, copy_root, manifest_sha256, file_count,
            total_bytes, verified, created_at
          from bridge_dit_copy_verifications
          where session_id = any(${ids}::uuid[])
          order by created_at desc
        `
      : [];
    return {
      organizationId: actor.organizationId,
      titles,
      sessions: sessions.map((session) => ({
        ...session,
        sourceFileCount: Number(session.source_file_count),
        sourceTotalBytes: Number(session.source_total_bytes),
        createdAt: session.created_at instanceof Date ? session.created_at.toISOString() : String(session.created_at),
        signedOffAt: session.signed_off_at ? String(session.signed_off_at) : null,
        copies: copies.filter((copy) => copy.session_id === session.id).map((copy) => ({
          id: copy.id,
          copyType: copy.copy_type as "PRIMARY" | "RECOVERY",
          copyRoot: copy.copy_root,
          manifestSha256: copy.manifest_sha256,
          fileCount: Number(copy.file_count),
          totalBytes: Number(copy.total_bytes),
          verified: Boolean(copy.verified),
          createdAt: copy.created_at instanceof Date ? copy.created_at.toISOString() : String(copy.created_at),
        })),
      })),
    };
  });

export const createDitIngestSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireDitOperator(context.userId);
    const sql = await getSql();
    const title = await requireStudioTitle(sql, data.titleId, actor.organizationId!);
    const files = normalizeDitFiles(data.manifest.files);
    const digest = ditManifestDigest(files);
    const totals = ditManifestTotals(files);
    const id = randomUUID();

    await sql.transaction(async (tx) => {
      await tx`
        insert into bridge_dit_ingest_sessions (
          id, title_id, organization_id, created_by, camera_unit, camera_label, card_label,
          shoot_date, source_volume, source_root, source_manifest_sha256, source_file_count,
          source_total_bytes, status
        ) values (
          ${id}::uuid, ${title.id}, ${actor.organizationId}, ${actor.userId},
          ${data.cameraUnit}, ${data.cameraLabel}, ${data.cardLabel}, ${data.shootDate},
          ${data.sourceVolume}, ${data.sourceRoot}, ${digest}, ${totals.fileCount},
          ${totals.totalBytes}, 'SOURCE_VERIFIED'
        )
      `;
      await tx`
        insert into bridge_dit_ingest_files (session_id, relative_path, byte_size, sha256)
        select ${id}::uuid, f.relative_path, f.byte_size, f.sha256
        from jsonb_to_recordset(${JSON.stringify(files.map((file) => ({ relative_path: file.relativePath, byte_size: file.byteSize, sha256: file.sha256 })))}::jsonb)
          as f(relative_path text, byte_size bigint, sha256 text)
      `;
      await audit(tx, actor.userId, "dit.source_manifest_registered", id, {
        titleId: title.id, fileCount: totals.fileCount, totalBytes: totals.totalBytes, manifestSha256: digest,
      });
    });
    return { sessionId: id, titleName: title.name, fileCount: totals.fileCount, totalBytes: totals.totalBytes, manifestSha256: digest };
  });

/** Issue a short-lived OCI upload URL for one manifest file in the Primary Vault. */
export const requestDitFileUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uploadFileInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireDitOperator(context.userId);
    const sql = await getSql();
    const session = await requireSession(sql, data.sessionId, actor.organizationId!);
    if (session.status === "SIGNED_OFF") throw new Error("A signed-off DIT session is locked");

    const primaryBucket = bridgeEnv.ociBucket();
    const recoveryBucket = bridgeEnv.ociRecoveryBucket();
    if (!primaryBucket || !recoveryBucket) {
      throw new Error("DIT media transfer is disabled until OCI Primary and Recovery buckets are configured");
    }
    if (primaryBucket === recoveryBucket) {
      throw new Error("OCI Primary and Recovery Vault must use different buckets");
    }

    const manifestFiles = await sql<{ byte_size: number | string; sha256: string }>`
      select byte_size, sha256
      from bridge_dit_ingest_files
      where session_id = ${data.sessionId}::uuid and relative_path = ${data.relativePath}
      limit 1
    `;
    const manifestFile = manifestFiles[0];
    if (!manifestFile) throw new Error("File is not present in the registered camera-card manifest");

    const prior = await sql<{ status: string }>`
      select status from bridge_dit_storage_objects
      where session_id = ${data.sessionId}::uuid
        and relative_path = ${data.relativePath}
        and copy_type = 'PRIMARY'
      limit 1
    `;
    if (prior[0]?.status === "VERIFIED") {
      return { alreadyUploaded: true as const, relativePath: data.relativePath };
    }

    const objectKey = `bridge-dit/${actor.organizationId}/${data.sessionId}/PRIMARY/${data.relativePath}`;
    const signed = await signUpload({
      key: objectKey,
      contentType: "application/octet-stream",
      expiresIn: 3600,
      bucket: primaryBucket,
    });
    await sql`
      insert into bridge_dit_storage_objects (
        session_id, relative_path, copy_type, bucket_name, object_key,
        sha256, byte_size, status, created_by, updated_at
      ) values (
        ${data.sessionId}::uuid, ${data.relativePath}, 'PRIMARY', ${primaryBucket},
        ${objectKey}, ${manifestFile.sha256.toLowerCase()}, ${Number(manifestFile.byte_size)},
        'UPLOAD_PENDING', ${actor.userId}, now()
      )
      on conflict (session_id, relative_path, copy_type) do update set
        bucket_name = excluded.bucket_name,
        object_key = excluded.object_key,
        sha256 = excluded.sha256,
        byte_size = excluded.byte_size,
        etag = null,
        status = 'UPLOAD_PENDING',
        verified_at = null,
        created_by = excluded.created_by,
        updated_at = now()
    `;
    return { alreadyUploaded: false as const, relativePath: data.relativePath, upload: signed };
  });

/** Verify the uploaded Primary object from OCI, copy it to Recovery, and verify the bytes again. */
export const verifyDitFileUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(verifyFileInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireDitOperator(context.userId);
    const sql = await getSql();
    const session = await requireSession(sql, data.sessionId, actor.organizationId!);
    if (session.status === "SIGNED_OFF") throw new Error("A signed-off DIT session is locked");

    const primaryBucket = bridgeEnv.ociBucket();
    const recoveryBucket = bridgeEnv.ociRecoveryBucket();
    if (!primaryBucket || !recoveryBucket || primaryBucket === recoveryBucket) {
      throw new Error("Separate OCI Primary and Recovery buckets are required for DIT verification");
    }
    const rows = await sql<{
      object_key: string; sha256: string; byte_size: number | string; status: string;
    }>`
      select object_key, sha256, byte_size, status
      from bridge_dit_storage_objects
      where session_id = ${data.sessionId}::uuid
        and relative_path = ${data.relativePath}
        and copy_type = 'PRIMARY'
        and bucket_name = ${primaryBucket}
      limit 1
    `;
    const primary = rows[0];
    if (!primary) throw new Error("Primary upload has not been registered");
    if (primary.status === "VERIFIED") {
      return { verified: true as const, alreadyVerified: true as const, relativePath: data.relativePath };
    }

    const sourceMeta = await verifyObject(primary.object_key, "application/octet-stream", primaryBucket);
    if (sourceMeta.byteSize !== Number(primary.byte_size) || !sourceMeta.etag) {
      throw new Error("Primary OCI object size or ETag does not match the source manifest");
    }
    const sourceHash = await verifyObjectSha256(
      primary.object_key,
      primary.sha256,
      Number(primary.byte_size),
      primaryBucket,
    );
    const recoveryKey = `bridge-dit/${actor.organizationId}/${data.sessionId}/RECOVERY/${data.relativePath}`;
    await sealVerifiedObject(primary.object_key, recoveryKey, sourceMeta.etag, undefined, recoveryBucket);
    const recoveryMeta = await verifyObject(recoveryKey, "application/octet-stream", recoveryBucket);
    if (recoveryMeta.byteSize !== Number(primary.byte_size) || !recoveryMeta.etag) {
      throw new Error("Recovery OCI object size does not match the source manifest");
    }
    const recoveryHash = await verifyObjectSha256(
      recoveryKey,
      primary.sha256,
      Number(primary.byte_size),
      recoveryBucket,
    );
    if (sourceHash.sha256 !== recoveryHash.sha256) {
      throw new Error("Primary and Recovery OCI SHA-256 values differ");
    }

    await sql.transaction(async (tx) => {
      await tx`
        update bridge_dit_storage_objects
        set status = 'VERIFIED', etag = ${sourceMeta.etag}, verified_at = now(), updated_at = now()
        where session_id = ${data.sessionId}::uuid
          and relative_path = ${data.relativePath}
          and copy_type = 'PRIMARY'
          and bucket_name = ${primaryBucket}
      `;
      await tx`
        insert into bridge_dit_storage_objects (
          session_id, relative_path, copy_type, bucket_name, object_key,
          sha256, byte_size, etag, status, verified_at, created_by, updated_at
        ) values (
          ${data.sessionId}::uuid, ${data.relativePath}, 'RECOVERY', ${recoveryBucket},
          ${recoveryKey}, ${recoveryHash.sha256}, ${recoveryHash.byteSize},
          ${recoveryMeta.etag}, 'VERIFIED', now(), ${actor.userId}, now()
        )
        on conflict (session_id, relative_path, copy_type) do update set
          bucket_name = excluded.bucket_name,
          object_key = excluded.object_key,
          sha256 = excluded.sha256,
          byte_size = excluded.byte_size,
          etag = excluded.etag,
          status = 'VERIFIED',
          verified_at = now(),
          created_by = excluded.created_by,
          updated_at = now()
      `;
      await audit(tx, actor.userId, "dit.file_primary_recovery_verified", data.sessionId, {
        relativePath: data.relativePath,
        primaryBucket,
        recoveryBucket,
        byteSize: sourceHash.byteSize,
        sha256: sourceHash.sha256,
      });
    });
    return {
      verified: true as const,
      alreadyVerified: false as const,
      relativePath: data.relativePath,
      byteSize: sourceHash.byteSize,
      sha256: sourceHash.sha256,
      primaryBucket,
      recoveryBucket,
    };
  });

/** A copy manifest is accepted only when every file has matching server-verified OCI object evidence. */
export const recordDitCopyVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(copyInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireDitOperator(context.userId);
    const sql = await getSql();
    const session = await requireSession(sql, data.sessionId, actor.organizationId!);
    if (session.status === "SIGNED_OFF") throw new Error("A signed-off DIT session is locked");
    const files = normalizeDitFiles(data.manifest.files);
    const digest = ditManifestDigest(files);
    const totals = ditManifestTotals(files);
    const expectedBucket = data.copyType === "PRIMARY"
      ? bridgeEnv.ociBucket()
      : bridgeEnv.ociRecoveryBucket();
    if (!expectedBucket) throw new Error("The requested OCI vault is not configured");

    const evidence = await sql<{ count: number }>`
      select count(*)::int as count
      from bridge_dit_ingest_files f
      join bridge_dit_storage_objects o
        on o.session_id = f.session_id and o.relative_path = f.relative_path
      where f.session_id = ${data.sessionId}::uuid
        and o.copy_type = ${data.copyType}
        and o.bucket_name = ${expectedBucket}
        and o.status = 'VERIFIED'
        and o.sha256 = f.sha256
        and o.byte_size = f.byte_size
    `;
    const verified = digest === session.source_manifest_sha256
      && totals.fileCount === Number(session.source_file_count)
      && totals.totalBytes === Number(session.source_total_bytes)
      && Number(evidence[0]?.count ?? 0) === totals.fileCount;
    await sql.transaction(async (tx) => {
      await tx`
        insert into bridge_dit_copy_verifications (
          session_id, copy_type, copy_root, manifest_sha256, file_count, total_bytes, verified, created_by
        ) values (
          ${data.sessionId}::uuid, ${data.copyType}, ${data.copyRoot}, ${digest},
          ${totals.fileCount}, ${totals.totalBytes}, ${verified}, ${actor.userId}
        )
        on conflict (session_id, copy_type) do update set
          copy_root = excluded.copy_root,
          manifest_sha256 = excluded.manifest_sha256,
          file_count = excluded.file_count,
          total_bytes = excluded.total_bytes,
          verified = excluded.verified,
          created_by = excluded.created_by,
          created_at = now()
      `;
      const matches = await tx<{ count: number }>`
        select count(*)::int as count from bridge_dit_copy_verifications
        where session_id = ${data.sessionId}::uuid and verified = true
      `;
      await tx`
        update bridge_dit_ingest_sessions set status = ${Number(matches[0]?.count ?? 0) === 2 ? "READY_FOR_SIGNOFF" : "SOURCE_VERIFIED"},
          updated_at = now()
        where id = ${data.sessionId}::uuid and status <> 'SIGNED_OFF'
      `;
      await audit(tx, actor.userId, verified ? "dit.copy_verified" : "dit.copy_mismatch", data.sessionId, {
        copyType: data.copyType, fileCount: totals.fileCount, totalBytes: totals.totalBytes,
        manifestSha256: digest, verified, verifiedObjects: Number(evidence[0]?.count ?? 0),
      });
    });
    if (!verified) throw new Error("Copy verification is incomplete: every source file must exist in the configured OCI vault with matching size and SHA-256");
    return { verified, copyType: data.copyType, fileCount: totals.fileCount, totalBytes: totals.totalBytes, manifestSha256: digest };
  });

export const signOffDitIngestSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(signoffInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireDitOperator(context.userId);
    const sql = await getSql();
    await sql.transaction(async (tx) => {
      const rows = await tx<SessionRow>`
        select id, title_id, organization_id, created_by, camera_unit, camera_label, card_label,
          shoot_date::text as shoot_date, source_volume, source_root, source_manifest_sha256,
          source_file_count, source_total_bytes, status, signoff_note, created_at, signed_off_at
        from bridge_dit_ingest_sessions
        where id = ${data.sessionId}::uuid and organization_id = ${actor.organizationId}
        for update
      `;
      if (!rows[0]) throw new Error("DIT ingest session was not found");
      if (rows[0].status === "SIGNED_OFF") throw new Error("DIT ingest session is already signed off");
      const copies = await tx<{ copy_type: string; verified: boolean }>`
        select copy_type, verified from bridge_dit_copy_verifications
        where session_id = ${data.sessionId}::uuid
      `;
      const verifiedTypes = new Set(copies.filter((copy) => copy.verified).map((copy) => copy.copy_type));
      if (!verifiedTypes.has("PRIMARY") || !verifiedTypes.has("RECOVERY")) {
        throw new Error("Primary Vault and Recovery Vault copies must both match the source manifest before sign-off");
      }
      await tx`
        update bridge_dit_ingest_sessions set status = 'SIGNED_OFF', signoff_note = ${data.signoffNote},
          signed_off_by = ${actor.userId}, signed_off_at = now(), updated_at = now()
        where id = ${data.sessionId}::uuid
      `;
      await audit(tx, actor.userId, "dit.ingest_signed_off", data.sessionId, {
        folderStructurePreserved: true,
        originalFilenamesPreserved: true,
        cameraCardRetained: true,
        primaryAndRecoveryVerified: true,
        note: data.signoffNote,
      });
    });
    return { sessionId: data.sessionId, status: "SIGNED_OFF" as const };
  });
