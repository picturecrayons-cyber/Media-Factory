import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { loadTitle } from "@/lib/bridge/titles";
import { canOperateOnTitle } from "@/lib/bridge/rbac";
import { writeAudit } from "@/lib/bridge/audit";
import { hashObjectSha256, sealVerifiedObject, signUpload, verifyObject, verifyObjectSha256 } from "@/lib/bridge/oci-object-storage.server";

function requireDitOperator(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (actor.internalRole === "super_admin") return;
  if (!actor.internalRole && actor.accountType === "studio") return;
  throw new Error("Studio DIT access required");
}

export const verifyDitFileCopies = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    jobId: z.string().uuid(),
    fileId: z.string().uuid(),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    requireDitOperator(actor);
    const sql = await getSql();
    const rows = await sql<{
      id: string; job_id: string; title_id: string; source_sha256: string | null;
      byte_size: number | null; master_object_key: string | null;
      backup_1_object_key: string | null; backup_2_object_key: string | null;
    }>`
      select f.id, f.job_id, j.title_id, f.source_sha256, f.byte_size,
        f.master_object_key, f.backup_1_object_key, f.backup_2_object_key
      from bridge_dit_job_files f
      join bridge_dit_jobs j on j.id = f.job_id
      where f.id = ${data.fileId}::uuid
        and f.job_id = ${data.jobId}::uuid
        and j.created_by = ${actor.userId}
      limit 1
    `;
    const file = rows[0];
    if (!file) throw new Error("DIT file not found or access denied");
    if (!file.source_sha256 || !file.byte_size || file.byte_size <= 0) {
      throw new Error("Source SHA-256 and byte size must be recorded before copy verification");
    }
    const keys = [
      ["MASTER", file.master_object_key],
      ["BACKUP_1", file.backup_1_object_key],
      ["BACKUP_2", file.backup_2_object_key],
    ] as const;
    if (keys.some(([, key]) => !key)) {
      throw new Error("All three isolated OCI object keys are required");
    }
    const verified = await Promise.all(keys.map(async ([copy, key]) => ({
      copy,
      result: await verifyObjectSha256(key!, file.source_sha256!, Number(file.byte_size)),
    })));
    const byCopy = Object.fromEntries(verified.map(({ copy, result }) => [copy, result]));
    await sql`
      update bridge_dit_job_files
      set master_sha256 = ${byCopy.MASTER.sha256},
          backup_1_sha256 = ${byCopy.BACKUP_1.sha256},
          backup_2_sha256 = ${byCopy.BACKUP_2.sha256},
          master_verified_at = now(),
          backup_1_verified_at = now(),
          backup_2_verified_at = now(),
          status = 'VERIFIED',
          updated_at = now()
      where id = ${data.fileId}::uuid and job_id = ${data.jobId}::uuid
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "dit.file_three_copy_sha256_verified",
      entityType: "bridge_dit_job_file",
      entityId: data.fileId,
      metadata: { jobId: data.jobId, titleId: file.title_id, copies: ["MASTER", "BACKUP_1", "BACKUP_2"] },
    });
    return { fileId: data.fileId, verifiedCopies: ["MASTER", "BACKUP_1", "BACKUP_2"] as const, sha256: file.source_sha256 };
  });

export const signOffDitJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    jobId: z.string().uuid(),
    statement: z.string().trim().min(20).max(2000),
    checklist: z.object({
      sourceReconciled: z.literal(true),
      noMissingClips: z.literal(true),
      noDuplicateClips: z.literal(true),
      checksumsVerified: z.literal(true),
      allThreeCopiesVerified: z.literal(true),
      sourceCardSafeToReuse: z.literal(true),
    }),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    requireDitOperator(actor);
    const sql = await getSql();
    const jobs = await sql<{ id: string; title_id: string }>`
      select id, title_id from bridge_dit_jobs
      where id = ${data.jobId}::uuid and created_by = ${actor.userId}
      limit 1
    `;
    if (!jobs[0]) throw new Error("DIT job not found or access denied");
    const counts = await sql<{ total: number; not_verified: number }>`
      select count(*)::int as total,
        count(*) filter (
          where status <> 'VERIFIED'
            or source_sha256 is null
            or master_sha256 is distinct from source_sha256
            or backup_1_sha256 is distinct from source_sha256
            or backup_2_sha256 is distinct from source_sha256
            or master_verified_at is null
            or backup_1_verified_at is null
            or backup_2_verified_at is null
        )::int as not_verified
      from bridge_dit_job_files
      where job_id = ${data.jobId}::uuid
    `;
    if (!counts[0] || counts[0].total < 1 || counts[0].not_verified !== 0) {
      throw new Error("Card-safe gate blocked: every discovered file must pass source SHA-256 and all three independent OCI copy checks");
    }
    await sql`
      insert into bridge_dit_signoffs (job_id, signed_by, statement, checklist)
      values (${data.jobId}::uuid, ${actor.userId}, ${data.statement}, ${JSON.stringify(data.checklist)}::jsonb)
    `;
    await sql`
      update bridge_dit_jobs
      set card_safe = true, status = 'COMPLETED', updated_at = now()
      where id = ${data.jobId}::uuid and created_by = ${actor.userId}
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "dit.job_signed_off_card_safe",
      entityType: "bridge_dit_job",
      entityId: data.jobId,
      metadata: { titleId: jobs[0].title_id, fileCount: counts[0].total },
    });
    return { jobId: data.jobId, cardSafe: true as const, signedOff: true as const };
  });

export const getDitWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    requireDitOperator(actor);
    const sql = await getSql();
    const settings = await sql<{ enabled: boolean }>`
      select enabled from bridge_dit_agent_settings where user_id = ${actor.userId} limit 1
    `;
    const jobs = await sql<{
      id: string; title_id: string; source_label: string; source_type: string;
      status: string; card_safe: boolean; created_at: string;
    }>`
      select id, title_id, source_label, source_type, status, card_safe, created_at
      from bridge_dit_jobs
      where created_by = ${actor.userId}
      order by created_at desc limit 50
    `;
    return { enabled: settings[0]?.enabled ?? false, jobs };
  });

export const setDitAgentEnabled = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    requireDitOperator(actor);
    const sql = await getSql();
    await sql`
      insert into bridge_dit_agent_settings (user_id, enabled, updated_at)
      values (${actor.userId}, ${data.enabled}, now())
      on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now()
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: data.enabled ? "dit.agent_enabled" : "dit.agent_disabled",
      entityType: "bridge_dit_agent_settings",
      entityId: actor.userId,
    });
    return { enabled: data.enabled };
  });

export const createDitIntakeJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8).max(120),
    sourceLabel: z.string().trim().min(1).max(160),
    sourceType: z.enum(["CAMERA_CARD", "EXTERNAL_DRIVE", "FOLDER"]),
    studioLabel: z.string().trim().max(160).optional(),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    requireDitOperator(actor);
    const sql = await getSql();
    const enabled = await sql<{ enabled: boolean }>`
      select enabled from bridge_dit_agent_settings where user_id = ${actor.userId} limit 1
    `;
    if (!enabled[0]?.enabled) throw new Error("Enable DIT Agent before creating an intake job");
    const title = await loadTitle(data.titleId);
    if (!title || !canOperateOnTitle(actor, title, "title.advance_upload", "title.ingest_internal")) {
      throw new Error("You cannot operate DIT intake for this title");
    }
    const id = randomUUID();
    await sql`
      insert into bridge_dit_jobs
        (id, title_id, created_by, studio_label, source_label, source_type, status, card_safe, metadata)
      values
        (${id}::uuid, ${title.id}, ${actor.userId}, ${data.studioLabel ?? null},
         ${data.sourceLabel}, ${data.sourceType}, 'CREATED', false,
         jsonb_build_object('ingestStatus', 'NOT_CONNECTED', 'storageStatus', 'NOT_STARTED'))
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "dit.intake_job_created",
      entityType: "bridge_dit_job",
      entityId: id,
      metadata: { titleId: title.id, sourceType: data.sourceType },
    });
    return { jobId: id, status: "CREATED" as const, cardSafe: false as const };
  });

const DIT_EXTENSIONS: Record<string, string> = {
  ".ari": "ARRIRAW", ".r3d": "RED_RAW", ".mov": "QUICKTIME_CONTAINER",
  ".mxf": "MXF_CONTAINER", ".mp4": "MPEG4_CONTAINER", ".wav": "WAVE_AUDIO",
  ".braw": "BLACKMAGIC_RAW", ".crm": "CANON_RAW", ".xml": "SIDECAR",
  ".ale": "SIDECAR", ".csv": "SIDECAR", ".json": "SIDECAR", ".srt": "SUBTITLE",
};

function safeDitName(value: string) {
  const cleaned = value.replaceAll("\\", "/").split("/").pop() ?? "";
  const safe = cleaned.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  if (!safe || safe === "." || safe === "..") throw new Error("Invalid DIT filename");
  return safe;
}

async function ownedDitJob(userId: string, jobId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; title_id: string }>`
    select id, title_id from bridge_dit_jobs where id = ${jobId}::uuid and created_by = ${userId} limit 1
  `;
  if (!rows[0]) throw new Error("DIT job not found or access denied");
  return rows[0];
}

/** Register a camera-card file while retaining its folder-relative path and sidecar identity. */
export const registerDitFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    jobId: z.string().uuid(),
    relativePath: z.string().trim().min(1).max(1000),
    fileName: z.string().trim().min(1).max(160),
    byteSize: z.number().int().positive().max(200 * 1024 * 1024 * 1024),
    contentType: z.string().trim().min(3).max(160),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    requireDitOperator(actor);
    const job = await ownedDitJob(actor.userId, data.jobId);
    const sql = await getSql();
    const relativePath = data.relativePath.replaceAll("\\", "/").split("/").filter(Boolean).join("/");
    if (relativePath.split("/").some((part) => part === ".." || part === ".")) throw new Error("Unsafe relative path");
    const fileName = safeDitName(data.fileName);
    const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
    const detectedFormat = DIT_EXTENSIONS[extension] ?? "UNKNOWN";
    const existing = await sql<{ id: string; byte_size: number; content_type: string | null; source_object_key: string; status: string }>`
      select id, byte_size, content_type, source_object_key, status
      from bridge_dit_job_files where job_id = ${data.jobId}::uuid and relative_path = ${relativePath} limit 1
    `;
    if (existing[0]) {
      if (existing[0].status === "VERIFIED") throw new Error("This file is already verified; do not ingest it again");
      if (Number(existing[0].byte_size) !== data.byteSize || existing[0].content_type !== data.contentType) {
        throw new Error("Retry file size or content type differs from the original manifest");
      }
      const signedRetry = await signUpload({ key: existing[0].source_object_key, contentType: data.contentType, expiresIn: 3600 });
      await sql`
        update bridge_dit_job_files set status = 'QUEUED', updated_at = now()
        where id = ${existing[0].id}::uuid
      `;
      await sql`
        insert into bridge_dit_job_logs (job_id, file_id, level, event, details)
        values (${data.jobId}::uuid, ${existing[0].id}::uuid, 'WARNING', 'UPLOAD_RETRY_ISSUED', '{}'::jsonb)
      `;
      return { fileId: existing[0].id, upload: signedRetry, detectedFormat, codec: null as string | null, codecStatus: "NOT_PROBED" as const };
    }
    const id = randomUUID();
    const root = `bridge-dit/${actor.userId}/${data.jobId}/${id}`;
    const sourceKey = `${root}/SOURCE/${fileName}`;
    const masterKey = `${root}/MASTER/${fileName}`;
    const backup1Key = `${root}/BACKUP_1/${fileName}`;
    const backup2Key = `${root}/BACKUP_2/${fileName}`;
    await sql`
      insert into bridge_dit_job_files
        (id, job_id, relative_path, file_name, detected_format, codec, byte_size,
         source_object_key, content_type, master_object_key, backup_1_object_key, backup_2_object_key, status)
      values
        (${id}::uuid, ${data.jobId}::uuid, ${relativePath}, ${fileName}, ${detectedFormat},
         null, ${data.byteSize}, ${sourceKey}, ${data.contentType},
         ${masterKey}, ${backup1Key}, ${backup2Key}, 'QUEUED')
    `;
    await sql`
      insert into bridge_dit_job_logs (job_id, file_id, level, event, details)
      values (${data.jobId}::uuid, ${id}::uuid, 'INFO', 'FILE_DISCOVERED',
        jsonb_build_object('relativePath', ${relativePath}, 'byteSize', ${data.byteSize}, 'detectedFormat', ${detectedFormat}))
    `;
    await sql`update bridge_dit_jobs set status = 'INGESTING', updated_at = now() where id = ${data.jobId}::uuid`;
    const signed = await signUpload({ key: sourceKey, contentType: data.contentType, expiresIn: 3600 });
    await sql`
      insert into bridge_dit_job_logs (job_id, file_id, level, event, details)
      values (${data.jobId}::uuid, ${id}::uuid, 'INFO', 'UPLOAD_URL_ISSUED', jsonb_build_object('expiresInSeconds', 3600))
    `;
    await writeAudit({ actorUserId: actor.userId, action: "dit.file_upload_signed", entityType: "bridge_dit_job_file", entityId: id, metadata: { jobId: data.jobId, titleId: job.title_id } });
    return { fileId: id, upload: signed, detectedFormat, codec: null as string | null, codecStatus: "NOT_PROBED" as const };
  });

/** Finalize an uploaded source object, create isolated three-copy objects, and verify each by streaming SHA-256. */
export const finalizeDitFileUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ jobId: z.string().uuid(), fileId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    requireDitOperator(actor);
    await ownedDitJob(actor.userId, data.jobId);
    const sql = await getSql();
    const rows = await sql<{
      id: string; source_object_key: string; byte_size: number; content_type: string | null;
      master_object_key: string; backup_1_object_key: string; backup_2_object_key: string;
      status: string;
    }>`
      select f.id, f.source_object_key, f.byte_size, f.content_type,
        f.master_object_key, f.backup_1_object_key, f.backup_2_object_key, f.status
      from bridge_dit_job_files f join bridge_dit_jobs j on j.id = f.job_id
      where f.id = ${data.fileId}::uuid and f.job_id = ${data.jobId}::uuid
        and j.created_by = ${actor.userId} limit 1
    `;
    const file = rows[0];
    if (!file) throw new Error("DIT file not found or access denied");
    if (file.status === "VERIFIED") return { fileId: file.id, verified: true as const };
    const source = await verifyObject(file.source_object_key, file.content_type);
    if (source.byteSize !== Number(file.byte_size) || !source.etag) throw new Error("Uploaded source size or ETag did not match the intake manifest");
    const sourceHash = await hashObjectSha256(file.source_object_key);
    if (sourceHash.byteSize !== Number(file.byte_size) || !sourceHash.etag) throw new Error("Source object changed during SHA-256 verification");
    await sql`
      update bridge_dit_job_files set source_sha256 = ${sourceHash.sha256}, status = 'VERIFYING', updated_at = now()
      where id = ${data.fileId}::uuid
    `;
    await sql`
      insert into bridge_dit_job_logs (job_id, file_id, level, event, details)
      values (${data.jobId}::uuid, ${data.fileId}::uuid, 'INFO', 'SOURCE_SHA256_READY',
        jsonb_build_object('byteSize', ${sourceHash.byteSize}, 'sha256', ${sourceHash.sha256}, 'etag', ${sourceHash.etag}))
    `;
    const duplicates = await sql<{ id: string; relative_path: string }>`
      select id, relative_path from bridge_dit_job_files
      where job_id = ${data.jobId}::uuid and id <> ${data.fileId}::uuid and source_sha256 = ${sourceHash.sha256}
      limit 1
    `;
    if (duplicates[0]) {
      await sql`
        update bridge_dit_job_files
        set status = 'WARNING', warnings = jsonb_build_array(jsonb_build_object(
          'code', 'DUPLICATE_CONTENT_SHA256', 'matchesFileId', ${duplicates[0].id}, 'matchesPath', ${duplicates[0].relative_path}
        )), updated_at = now()
        where id = ${data.fileId}::uuid
      `;
      await sql`
        insert into bridge_dit_job_logs (job_id, file_id, level, event, details)
        values (${data.jobId}::uuid, ${data.fileId}::uuid, 'WARNING', 'DUPLICATE_CONTENT_DETECTED',
          jsonb_build_object('matchesFileId', ${duplicates[0].id}, 'matchesPath', ${duplicates[0].relative_path}, 'sha256', ${sourceHash.sha256}))
      `;
      return { fileId: file.id, byteSize: sourceHash.byteSize, sha256: sourceHash.sha256, verifiedCopies: [] as string[], duplicate: true as const };
    }
    const destinations = [
      ["MASTER", file.master_object_key],
      ["BACKUP_1", file.backup_1_object_key],
      ["BACKUP_2", file.backup_2_object_key],
    ] as const;
    for (const [copy, key] of destinations) {
      await sealVerifiedObject(file.source_object_key, key, sourceHash.etag);
      await sql`
        insert into bridge_dit_job_logs (job_id, file_id, level, event, details)
        values (${data.jobId}::uuid, ${data.fileId}::uuid, 'INFO', 'COPY_CREATED',
          jsonb_build_object('copy', ${copy}, 'objectKey', ${key}))
      `;
    }
    const checks = await Promise.all(destinations.map(async ([copy, key]) => ({
      copy, result: await verifyObjectSha256(key, sourceHash.sha256, sourceHash.byteSize),
    })));
    const byCopy = Object.fromEntries(checks.map(({ copy, result }) => [copy, result]));
    await sql`
      update bridge_dit_job_files
      set master_sha256 = ${byCopy.MASTER.sha256}, backup_1_sha256 = ${byCopy.BACKUP_1.sha256},
          backup_2_sha256 = ${byCopy.BACKUP_2.sha256}, master_verified_at = now(),
          backup_1_verified_at = now(), backup_2_verified_at = now(), status = 'VERIFIED', updated_at = now()
      where id = ${data.fileId}::uuid and job_id = ${data.jobId}::uuid
    `;
    await sql`
      insert into bridge_dit_job_logs (job_id, file_id, level, event, details)
      values (${data.jobId}::uuid, ${data.fileId}::uuid, 'PASS', 'THREE_COPY_SHA256_VERIFIED',
        jsonb_build_object('sourceSha256', ${sourceHash.sha256}, 'copies', jsonb_build_array('MASTER','BACKUP_1','BACKUP_2')))
    `;
    await writeAudit({ actorUserId: actor.userId, action: "dit.file_three_copy_verified", entityType: "bridge_dit_job_file", entityId: data.fileId, metadata: { jobId: data.jobId, byteSize: sourceHash.byteSize } });
    return { fileId: file.id, byteSize: sourceHash.byteSize, sha256: sourceHash.sha256, verifiedCopies: ["MASTER", "BACKUP_1", "BACKUP_2"] as const };
  });

export const getDitJobFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ jobId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    requireDitOperator(actor);
    await ownedDitJob(actor.userId, data.jobId);
    const sql = await getSql();
    const [files, logs] = await Promise.all([
      sql`select id, relative_path, file_name, detected_format, codec, byte_size, status, source_sha256,
        master_verified_at, backup_1_verified_at, backup_2_verified_at
        from bridge_dit_job_files where job_id = ${data.jobId}::uuid order by created_at asc`,
      sql`select id, file_id, level, event, details, created_at
        from bridge_dit_job_logs where job_id = ${data.jobId}::uuid order by created_at desc limit 100`,
    ]);
    return { files, logs };
  });

