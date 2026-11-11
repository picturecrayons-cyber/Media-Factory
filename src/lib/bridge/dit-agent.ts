import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { loadTitle } from "@/lib/bridge/titles";
import { canOperateOnTitle } from "@/lib/bridge/rbac";
import { writeAudit } from "@/lib/bridge/audit";

function requireDitOperator(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (actor.internalRole === "super_admin") return;
  if (!actor.internalRole && actor.accountType === "studio") return;
  throw new Error("Studio DIT access required");
}

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
