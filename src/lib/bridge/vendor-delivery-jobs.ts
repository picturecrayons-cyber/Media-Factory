import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { assertPermission, canOperateOnTitle, type Actor } from "./rbac";
import { requireVerifiedActor } from "./session";

const jobType = z.enum(["dubbing", "loudness_check", "imf_request", "dcp_request", "human_qc"]);
const actionSchema = z.enum(["start_review", "sign_off", "block"]);

type VendorJobRow = {
  id: string;
  title_id: string;
  title_name: string;
  job_type: z.infer<typeof jobType>;
  state: "requested" | "in_review" | "blocked" | "signed_off";
  note: string;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

function canRequest(actor: Actor, ownerUserId: string): boolean {
  return canOperateOnTitle(
    actor,
    { ownerUserId },
    "title.create",
    "title.deliver",
  );
}

export const listVendorDeliveryJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const internal = Boolean(actor.internalRole);
    const rows = await sql<VendorJobRow>`
      select j.id, j.title_id, t.name as title_name, j.job_type, j.state, j.note,
             j.requested_by, j.reviewed_by, j.reviewed_at, j.created_at, j.updated_at
      from public.bridge_vendor_jobs j
      join public.bridge_titles t on t.id = j.title_id
      where (${internal} or t.owner_user_id = ${actor.userId})
      order by j.created_at desc
      limit 200
    `;
    return { jobs: rows };
  });

export const requestVendorDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().trim().min(1).max(200),
    type: jobType,
    note: z.string().trim().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [title] = await tx<{ owner_user_id: string }>`
        select owner_user_id from public.bridge_titles where id = ${data.titleId} for update
      `;
      if (!title || !canRequest(actor, title.owner_user_id)) throw new Error("Forbidden");
      const id = randomUUID();
      await tx`
        insert into public.bridge_vendor_jobs
          (id, title_id, job_type, state, note, requested_by)
        values (${id}, ${data.titleId}, ${data.type}, 'requested', ${data.note ?? ""}, ${actor.userId})
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "delivery.vendor_job.requested",
        entityType: "bridge_vendor_job",
        entityId: id,
        metadata: { titleId: data.titleId, type: data.type },
      }, tx);
      return { id, state: "requested" as const };
    });
  });

export const transitionVendorDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    jobId: z.string().uuid(),
    action: actionSchema,
    note: z.string().trim().min(4).max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.deliver");
    if (!actor.internalRole) throw new Error("Forbidden");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [job] = await tx<{
        id: string; title_id: string; state: string; title_name: string;
      }>`
        select j.id, j.title_id, j.state, t.name as title_name
        from public.bridge_vendor_jobs j
        join public.bridge_titles t on t.id = j.title_id
        where j.id = ${data.jobId}
        for update of j
      `;
      if (!job) throw new Error("Not found");
      let next: "in_review" | "blocked" | "signed_off";
      if (data.action === "start_review" && job.state === "requested") next = "in_review";
      else if (data.action === "sign_off" && job.state === "in_review") next = "signed_off";
      else if (data.action === "block" && (job.state === "requested" || job.state === "in_review")) next = "blocked";
      else throw new Error("Invalid vendor job state transition");
      await tx`
        update public.bridge_vendor_jobs
        set state = ${next},
            note = case when ${data.note ?? null}::text is null then note else ${data.note ?? null} end,
            reviewed_by = case when ${next} = 'signed_off' then ${actor.userId} else reviewed_by end,
            reviewed_at = case when ${next} = 'signed_off' then now() else reviewed_at end,
            updated_at = now()
        where id = ${job.id}
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: `delivery.vendor_job.${data.action}`,
        entityType: "bridge_vendor_job",
        entityId: job.id,
        metadata: { titleId: job.title_id, from: job.state, to: next, note: data.note ?? null },
      }, tx);
      return { id: job.id, state: next };
    });
  });
