import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { loadTitle } from "@/lib/bridge/titles";
import { canOperateOnTitle } from "@/lib/bridge/rbac";
import { writeAudit } from "@/lib/bridge/audit";
import { verifyObjectSha256 } from "@/lib/bridge/oci-object-storage.server";

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
