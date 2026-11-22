import { createServerFn } from "@tanstack/react-start";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission, canReadTitle, hasPermission } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { verifyObject, verifyObjectSha256 } from "./oci-object-storage.server";
import {
  canRequestVendorJob,
  deliveryFinalGate,
  isValidSha256Receipt,
  isValidVendorReceiptKey,
} from "./delivery-job-policy";

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

function hasDeliveryPermission(actor: Awaited<ReturnType<typeof actorFor>>) {
  return Boolean(actor.internalRole && hasPermission(actor, "title.deliver"));
}

export const listBridgeDeliveryJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    try {
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
            receipt_object_key: string | null; receipt_sha256: string | null; receipt_byte_size: number | null;
            receipt_verified_at: string | Date | null;
          }>`
            select id, title_id, job_type, status, assigned_vendor, delivery_receipt_url,
              admin_sign_off, request_note, requested_by, created_at, updated_at,
              receipt_object_key, receipt_sha256, receipt_byte_size, receipt_verified_at
            from bridge_delivery_jobs order by created_at desc limit 200
          `
        : await sql<{
            id: string; title_id: string; job_type: string; status: string; assigned_vendor: string | null;
            delivery_receipt_url: string | null; admin_sign_off: boolean; request_note: string | null;
            requested_by: string | null; created_at: string | Date; updated_at: string | Date;
            receipt_object_key: string | null; receipt_sha256: string | null; receipt_byte_size: number | null;
            receipt_verified_at: string | Date | null;
          }>`
            select j.id, j.title_id, j.job_type, j.status, j.assigned_vendor, j.delivery_receipt_url,
              j.admin_sign_off, j.request_note, j.requested_by, j.created_at, j.updated_at,
              j.receipt_object_key, j.receipt_sha256, j.receipt_byte_size, j.receipt_verified_at
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
          receiptVerified: Boolean(row.receipt_verified_at && row.receipt_object_key && row.receipt_sha256 && row.receipt_byte_size),
          receiptSha256: row.receipt_sha256,
          receiptByteSize: row.receipt_byte_size === null ? null : Number(row.receipt_byte_size),
          signedOff: row.admin_sign_off,
          note: row.request_note ?? "",
          requestedBy: row.requested_by,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        })),
      };
    } catch (error) {
      const reference = randomBytes(6).toString("hex");
      const diagnostic = error as { code?: string; name?: string };
      console.error("[bridge-delivery] list failed", {
        reference,
        databaseCode: diagnostic?.code ?? "unavailable",
        errorName: diagnostic?.name ?? "UnknownError",
      });
      if (diagnostic?.code === "42P01") {
        throw new Error(`Vendor Jobs schema is unavailable. Ask an administrator to reconcile the Delivery Desk baseline. Reference: ${reference}`);
      }
      throw new Error(`Vendor Jobs could not be loaded. Retry the request. Reference: ${reference}`);
    }
  });

export const requestBridgeDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8).max(100),
    type: jobType,
    note: z.string().max(2000).optional(),
    idempotencyKey: z.string().uuid(),
  }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found");
    const canManage = hasDeliveryPermission(actor);
    if (actor.internalRole && !canManage) throw new Error("Delivery operator permission required");
    const canRead = canReadTitle(actor, title);
    if (!canRequestVendorJob({
      submissionType: title.submissionType,
      actorCanReadTitle: canRead,
      actorCanManageDelivery: canManage,
      accountType: actor.accountType,
    })) {
      throw new Error("Vendor requests require a finished film and an authorized owner or delivery operator");
    }
    const id = randomUUID();
    const sql = await getSql();
    const inserted = await sql<{ id: string; title_id: string; job_type: string; status: string }>`
      insert into bridge_delivery_jobs
        (id, title_id, job_type, status, requested_by, request_note, idempotency_key)
      values
        (${id}::uuid, ${title.id}, ${databaseType[data.type]}, 'requested', ${actor.userId}, ${data.note ?? null}, ${data.idempotencyKey}::uuid)
      on conflict (requested_by, idempotency_key)
        where requested_by is not null and idempotency_key is not null
      do nothing
      returning id, title_id, job_type, status
    `;
    if (!inserted[0]) {
      const existing = await sql<{ id: string; title_id: string; job_type: string; status: string }>`
        select id, title_id, job_type, status from bridge_delivery_jobs
        where requested_by = ${actor.userId} and idempotency_key = ${data.idempotencyKey}::uuid
        limit 1
      `;
      const prior = existing[0];
      if (!prior || prior.title_id !== title.id || prior.job_type !== databaseType[data.type]) {
        throw new Error("This idempotency key was already used for a different delivery request");
      }
      return { id: prior.id, status: prior.status, duplicate: true as const };
    }
    await writeAudit({
      actorUserId: actor.userId, action: "delivery.requested", entityType: "bridge_delivery_job",
      entityId: id, metadata: { titleId: title.id, jobType: data.type },
    });
    return { id, status: "requested" as const, duplicate: false as const };
  });

export const assignBridgeDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ jobId: z.string().uuid(), vendor: z.string().trim().min(2).max(160) }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    assertPermission(actor, "title.deliver");
    if (!actor.internalRole) throw new Error("Internal delivery operator required");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update bridge_delivery_jobs j
      set status='in_progress', assigned_vendor=${data.vendor}, updated_at=now()
      where j.id=${data.jobId}::uuid and j.status='requested'
        and exists (
          select 1 from bridge_titles t
          where t.id=j.title_id and t.submission_type='finished_film'
        )
      returning j.id
    `;
    if (!rows[0]) throw new Error("Only a requested finished-film job can be assigned");
    await writeAudit({ actorUserId: actor.userId, action: "delivery.assigned", entityType: "bridge_delivery_job", entityId: data.jobId, metadata: { vendor: data.vendor } });
    return { id: data.jobId, status: "in_progress" as const };
  });

export const completeBridgeDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    jobId: z.string().uuid(),
    receiptObjectKey: z.string().min(1).max(1024),
    receiptSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    receiptByteSize: z.number().int().positive().max(50 * 1024 * 1024),
  }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    assertPermission(actor, "title.deliver");
    if (!actor.internalRole) throw new Error("Internal delivery operator required");
    if (!isValidSha256Receipt(data.receiptSha256) || !isValidVendorReceiptKey(data.receiptObjectKey, data.jobId)) {
      throw new Error("Vendor receipt evidence reference is invalid");
    }
    const metadata = await verifyObject(data.receiptObjectKey, "application/pdf");
    if (metadata.byteSize !== data.receiptByteSize) throw new Error("Vendor receipt byte size does not match the private object");
    const verified = await verifyObjectSha256(data.receiptObjectKey, data.receiptSha256, data.receiptByteSize);
    if (!verified.verified) throw new Error("Vendor receipt evidence could not be verified");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update bridge_delivery_jobs j
      set status='completed',
          delivery_receipt_url=null,
          receipt_object_key=${data.receiptObjectKey},
          receipt_sha256=${verified.sha256},
          receipt_byte_size=${verified.byteSize},
          receipt_verified_at=now(),
          receipt_verified_by=${actor.userId},
          updated_at=now()
      where j.id=${data.jobId}::uuid and j.status='in_progress'
        and j.assigned_vendor is not null
        and exists (
          select 1 from bridge_titles t
          where t.id=j.title_id and t.submission_type='finished_film'
        )
      returning j.id
    `;
    if (!rows[0]) throw new Error("Only an assigned in-progress finished-film job can be completed");
    await writeAudit({
      actorUserId: actor.userId, action: "delivery.completed", entityType: "bridge_delivery_job",
      entityId: data.jobId, metadata: { receiptSha256: verified.sha256, receiptByteSize: verified.byteSize },
    });
    return { id: data.jobId, status: "completed" as const, receiptVerified: true as const };
  });

async function getFinalDeliveryReadiness(sql: Sql, titleId: string) {
  const rows = await sql<{
    submission_type: string | null;
    status: string;
    qc_ok: boolean;
    legal_ok: boolean;
    rights_ok: boolean;
    ott_ready: boolean;
    packaging_complete: boolean;
    curation_approved: boolean;
    delivery_ready: boolean;
  }>`
    select
      t.submission_type,
      t.status,
      exists (
        select 1 from bridge_qc_cases q
        where q.title_id=t.id and q.status='PASSED'
          and q.reviewer_findings->0->>'masterKey'=t.master_key
          and q.reviewer_findings->0->>'posterKey'=t.poster_key
      ) as qc_ok,
      exists (
        select 1 from bridge_rights_grants rg
        join bridge_legal_cases l on l.title_id=rg.title_id
          and l.status='APPROVED'
          and l.evidence->0->>'grantId'=rg.id::text
        where rg.title_id=t.id and rg.status='VALID'
          and rg.window_start <= now() and rg.window_end > now()
          and jsonb_array_length(coalesce(rg.territories,'[]'::jsonb)) > 0
          and jsonb_array_length(coalesce(rg.languages,'[]'::jsonb)) > 0
          and jsonb_array_length(coalesce(rg.media,'[]'::jsonb)) > 0
      ) as legal_ok,
      exists (
        select 1 from bridge_rights_grants rg
        where rg.title_id=t.id and rg.status='VALID'
          and rg.window_start <= now() and rg.window_end > now()
          and jsonb_array_length(coalesce(rg.territories,'[]'::jsonb)) > 0
          and jsonb_array_length(coalesce(rg.languages,'[]'::jsonb)) > 0
          and jsonb_array_length(coalesce(rg.media,'[]'::jsonb)) > 0
      ) as rights_ok,
      exists (
        select 1 from bridge_title_gate_certifications g
        where g.title_id=t.id and g.packaging_status='COMPLETE'
      ) as packaging_complete,
      exists (
        select 1 from bridge_title_gate_certifications g
        where g.title_id=t.id and g.delivery_status='READY'
      ) as delivery_ready
    from bridge_titles t
    where t.id=${titleId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Title not found");
  const gate = deliveryFinalGate({
    submissionType: row.submission_type,
    lifecycleReady: ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED"].includes(row.status),
    qcPassedForCurrentAssets: row.qc_ok,
    legalApproved: row.legal_ok,
    rightsGrantValid: row.rights_ok,
    ottPreparationReady: row.ott_ready,
    packagingComplete: row.packaging_complete,
    curationApproved: row.curation_approved,
    finalDeliveryGateReady: row.delivery_ready,
  });
  return gate;
}

export const approveBridgeDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ jobId: z.string().uuid(), note: z.string().trim().min(8).max(1000) }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin sign-off is required");
    assertPermission(actor, "loop.publish");
    const sql = await getSql();
    const result = await sql.transaction(async (tx) => {
      const jobs = await tx<{ id: string; title_id: string; status: string; receipt_verified_at: string | Date | null;
        receipt_object_key: string | null; receipt_sha256: string | null; receipt_byte_size: number | null }>`
        select id, title_id, status, receipt_verified_at, receipt_object_key, receipt_sha256, receipt_byte_size
        from bridge_delivery_jobs where id=${data.jobId}::uuid for update
      `;
      const job = jobs[0];
      if (!job || job.status !== "completed" || !job.receipt_verified_at ||
          !job.receipt_object_key || !job.receipt_sha256 || !job.receipt_byte_size) {
        throw new Error("Super Admin sign-off requires a completed job with verified receipt evidence");
      }
      const gate = await getFinalDeliveryReadiness(tx, job.title_id);
      if (!gate.ready) throw new Error(`Final delivery authorization blocked: ${gate.reasons.join(" ")}`);
      const updated = await tx<{ id: string; title_id: string }>`
        update bridge_delivery_jobs
        set status='approved', admin_sign_off=true, updated_at=now()
        where id=${data.jobId}::uuid and status='completed' and receipt_verified_at is not null
        returning id, title_id
      `;
      if (!updated[0]) throw new Error("Delivery job changed before Super Admin sign-off");
      return updated[0];
    });
    await writeAudit({
      actorUserId: actor.userId, action: "delivery.approved", entityType: "bridge_delivery_job", entityId: data.jobId,
      metadata: { titleId: result.title_id, note: data.note, finalDeliveryGate: "READY", receiptVerified: true },
    });
    // Deliberately do not update bridge_titles.status here. Vendor sign-off and
    // final Bridge lifecycle transitions remain independent operations.
    return { id: data.jobId, status: "approved" as const, titleStatusChanged: false as const };
  });
