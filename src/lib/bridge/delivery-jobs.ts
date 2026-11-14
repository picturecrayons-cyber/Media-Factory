import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission, canReadTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";

const jobType = z.enum(["dubbing", "loudness_check", "imf_request", "dcp_request", "human_qc", "localization"]);
const databaseType: Record<z.infer<typeof jobType>, string> = {
  dubbing: "dubbing",
  loudness_check: "loudness",
  imf_request: "imf",
  dcp_request: "dcp",
  human_qc: "human_qc",
  localization: "localization",
};
const uiType: Record<string, z.infer<typeof jobType>> = {
  dubbing: "dubbing", loudness: "loudness_check", imf: "imf_request",
  dcp: "dcp_request", human_qc: "human_qc", localization: "localization",
};

async function actorFor(userId: string) {
  assertNotDevUser(userId);
  return requireVerifiedActor(userId);
}

export const listBridgeDeliveryJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    const sql = await getSql();
    const internal = Boolean(actor.internalRole && (actor.internalRole === "admin" || actor.internalRole === "super_admin"));
    if (!internal && !actor.organizationId && !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Delivery workspace access required");
    }
    const rows = internal
      ? await sql<{
          id: string; title_id: string; job_type: string; status: string; assigned_vendor: string | null;
          delivery_receipt_url: string | null; admin_sign_off: boolean; request_note: string | null;
          requested_by: string | null; created_at: string | Date; updated_at: string | Date;
        }>`
          select id, title_id, job_type, status, assigned_vendor, delivery_receipt_url,
            admin_sign_off, request_note, requested_by, created_at, updated_at
          from bridge_delivery_jobs order by created_at desc limit 200
        `
      : await sql<{
          id: string; title_id: string; job_type: string; status: string; assigned_vendor: string | null;
          delivery_receipt_url: string | null; admin_sign_off: boolean; request_note: string | null;
          requested_by: string | null; created_at: string | Date; updated_at: string | Date;
        }>`
          select j.id, j.title_id, j.job_type, j.status, j.assigned_vendor, j.delivery_receipt_url,
            j.admin_sign_off, j.request_note, j.requested_by, j.created_at, j.updated_at
          from bridge_delivery_jobs j
          join bridge_titles t on t.id = j.title_id
          where j.requested_by = ${actor.userId}
            or t.owner_user_id = ${actor.userId}
            or (
              ${actor.accountType === "studio" && Boolean(actor.organizationId)}
              and t.owner_account_type = 'studio'
              and t.owner_organization_id = ${actor.organizationId ?? null}::uuid
              and exists (
                select 1 from bridge_organization_memberships m
                where m.organization_id = t.owner_organization_id
                  and m.user_id = ${actor.userId}
                  and m.status = 'active'
              )
            )
          order by j.created_at desc limit 200
        `;
    return {
      jobs: rows.map((row) => ({
        id: row.id,
        titleId: row.title_id,
        type: uiType[row.job_type] ?? row.job_type,
        state: row.status,
        assignedVendor: row.assigned_vendor,
        receiptUrl: row.delivery_receipt_url,
        signedOff: row.admin_sign_off,
        note: row.request_note ?? "",
        requestedBy: row.requested_by,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      })),
    };
  });

export const requestBridgeDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8).max(100),
    type: jobType,
    note: z.string().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found");
    const canManage = Boolean(actor.internalRole && hasDeliveryPermission(actor));
    if (!canManage && (!canReadTitle(actor, title) || actor.internalRole)) {
      throw new Error("You can request delivery services only for titles you are authorized to access");
    }
    if (!canManage && !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Delivery requests are not enabled for this account type");
    }
    const id = randomUUID();
    const sql = await getSql();
    await sql`
      insert into bridge_delivery_jobs (id, title_id, job_type, status, requested_by, request_note)
      values (${id}::uuid, ${title.id}, ${databaseType[data.type]}, 'requested', ${actor.userId}, ${data.note ?? null})
    `;
    await writeAudit({
      actorUserId: actor.userId, action: "delivery.requested", entityType: "bridge_delivery_job",
      entityId: id, metadata: { titleId: title.id, jobType: data.type },
    });
    return { id, status: "requested" as const };
  });

function hasDeliveryPermission(actor: Awaited<ReturnType<typeof actorFor>>) {
  try { assertPermission(actor, "title.deliver"); return true; } catch { return false; }
}

export const assignBridgeDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ jobId: z.string().uuid(), vendor: z.string().trim().min(2).max(160) }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    assertPermission(actor, "title.deliver");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update bridge_delivery_jobs set status='in_progress', assigned_vendor=${data.vendor}, updated_at=now()
      where id=${data.jobId}::uuid and status='requested' returning id
    `;
    if (!rows[0]) throw new Error("Only a requested delivery job can be assigned");
    await writeAudit({ actorUserId: actor.userId, action: "delivery.assigned", entityType: "bridge_delivery_job", entityId: data.jobId, metadata: { vendor: data.vendor } });
    return { id: data.jobId, status: "in_progress" as const };
  });

export const completeBridgeDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ jobId: z.string().uuid(), receiptUrl: z.string().url().max(2048) }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    assertPermission(actor, "title.deliver");
    const url = new URL(data.receiptUrl);
    if (url.protocol !== "https:") throw new Error("Delivery receipt must use HTTPS");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update bridge_delivery_jobs set status='completed', delivery_receipt_url=${url.toString()}, updated_at=now()
      where id=${data.jobId}::uuid and status='in_progress' returning id
    `;
    if (!rows[0]) throw new Error("Only an in-progress delivery job can be completed");
    await writeAudit({ actorUserId: actor.userId, action: "delivery.completed", entityType: "bridge_delivery_job", entityId: data.jobId });
    return { id: data.jobId, status: "completed" as const };
  });

export const approveBridgeDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ jobId: z.string().uuid(), note: z.string().trim().min(8).max(1000) }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    assertPermission(actor, "loop.publish");
    const sql = await getSql();
    const rows = await sql<{ id: string; title_id: string }>`
      update bridge_delivery_jobs set status='approved', admin_sign_off=true, updated_at=now()
      where id=${data.jobId}::uuid and status='completed' and delivery_receipt_url is not null
      returning id, title_id
    `;
    if (!rows[0]) throw new Error("Delivery sign-off requires a completed job with a receipt");
    await writeAudit({
      actorUserId: actor.userId, action: "delivery.approved", entityType: "bridge_delivery_job", entityId: data.jobId,
      metadata: { titleId: rows[0].title_id, note: data.note },
    });
    return { id: data.jobId, status: "approved" as const };
  });
