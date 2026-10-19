import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { writeAudit } from "./audit";

const services = ["dubbing", "localization", "accessibility", "finishing", "delivery_qc", "marketing"] as const;
const id = z.string().uuid();
type Order = {
  id: string;
  owner_user_id: string;
  service: string;
  lane: string;
  status: string;
  source_s3_key: string | null;
  output_s3_key: string | null;
  bridge_title_id: string | null;
  qc_status?: string | null;
  created_at: string | Date;
};

async function ownedOrder(orderId: string, userId: string) {
  const sql = await getSql();
  const rows = await sql<Order>`select * from streamvista_orders where id = ${orderId} and owner_user_id = ${userId} limit 1`;
  if (!rows[0]) throw new Error("Order not found");
  return rows[0];
}

export const createStreamVistaOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ service: z.enum(services), lane: z.enum(["self_service", "managed"]) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.create");
    const orderId = randomUUID();
    const sql = await getSql();
    await sql`insert into streamvista_orders (id, owner_user_id, service, lane)
      values (${orderId}, ${actor.userId}, ${data.service}, ${data.lane})`;
    await writeAudit({ actorUserId: actor.userId, action: "streamvista.order.create", entityType: "streamvista_order", entityId: orderId });
    return { id: orderId, status: "requested" as const };
  });

export const listStreamVistaOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.read_own");
    const sql = await getSql();
    const orders = await sql<Order>`select o.*,
      (select j.status from streamvista_jobs j where j.order_id = o.id and j.step = 'source_qc'
       order by j.created_at desc limit 1) as qc_status
      from streamvista_orders o
      where o.owner_user_id = ${actor.userId} order by o.created_at desc limit 100`;
    return { orders: orders.map(({ owner_user_id: _owner, ...order }) => order) };
  });

export const requestStreamVistaUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: id, filename: z.string().min(1).max(120), contentType: z.string().min(3).max(120) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "asset.sign_upload");
    const order = await ownedOrder(data.orderId, actor.userId);
    if (order.status !== "requested" || order.source_s3_key) throw new Error("Upload is closed");
    const { signUpload } = await import("./oci-object-storage.server");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    const key = `streamvista/${order.id}/source/${randomUUID()}-${safe}`;
    const signed = await signUpload({ key, contentType: data.contentType });
    return { ...signed, expiresIn: 900 };
  });

export const confirmStreamVistaUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: id, key: z.string().min(1).max(500) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "asset.sign_upload");
    await ownedOrder(data.orderId, actor.userId);
    if (!data.key.startsWith(`streamvista/${data.orderId}/source/`)) throw new Error("Invalid asset key");
    const { verifyObject } = await import("./oci-object-storage.server");
    await verifyObject(data.key);
    const sql = await getSql();
    const jobId = randomUUID();
    const rows = await sql<{ id: string }>`with confirmed as (
      update streamvista_orders set source_s3_key = ${data.key}, updated_at = now()
      where id = ${data.orderId} and owner_user_id = ${actor.userId}
      and status = 'requested' and source_s3_key is null returning id
    )
    insert into streamvista_jobs (id, order_id, step, status)
      select ${jobId}, id, 'source_qc', 'needs_review' from confirmed
      returning id`;
    if (!rows[0]) throw new Error("Upload already confirmed or order changed");
    await writeAudit({ actorUserId: actor.userId, action: "streamvista.source.confirmed", entityType: "streamvista_order", entityId: data.orderId });
    return { id: data.orderId, status: "requested" as const, sourceVerified: true, qcJobId: jobId };
  });

export const handoffStreamVistaOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: id, bridgeTitleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") throw new Error("Forbidden");
    assertPermission(actor, "loop.publish");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`update streamvista_orders o set bridge_title_id = ${data.bridgeTitleId}, updated_at = now()
      where o.id = ${data.orderId} and o.status = 'approved' and o.source_s3_key is not null
      and o.bridge_title_id is null and exists (
        select 1 from bridge_titles t where t.id = ${data.bridgeTitleId} and t.owner_user_id = o.owner_user_id
      ) returning o.id`;
    if (!rows[0]) throw new Error("Approved order and same-owner Bridge title required");
    await writeAudit({ actorUserId: actor.userId, action: "streamvista.bridge.handoff", entityType: "streamvista_order", entityId: data.orderId, metadata: { bridgeTitleId: data.bridgeTitleId } });
    return { id: data.orderId, bridgeTitleId: data.bridgeTitleId };
  });


// Persisted vendor/QC requests reuse the existing, server-only StreamVista job tables.
// No browser role receives direct table access and no new schema is required.
const vendorJobTypes = ["dubbing", "loudness_check", "imf_request", "dcp_request", "human_qc"] as const;
const vendorJobInput = z.object({
  titleId: z.string().trim().min(8).max(128),
  type: z.enum(vendorJobTypes),
});
const vendorService: Record<(typeof vendorJobTypes)[number], (typeof services)[number]> = {
  dubbing: "dubbing",
  loudness_check: "delivery_qc",
  imf_request: "finishing",
  dcp_request: "finishing",
  human_qc: "delivery_qc",
};
type VendorJobRow = {
  id: string;
  order_id: string;
  step: string;
  status: string;
  reviewer_user_id: string | null;
  reviewed_at: string | Date | null;
  title_id: string;
  title_name: string;
  owner_user_id: string;
  created_at: string | Date;
};

export const createPersistentVendorJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(vendorJobInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const [title] = await sql<{ id: string; owner_user_id: string; merged_into_title_id: string | null }>`
      select id,owner_user_id,merged_into_title_id from bridge_titles where id=${data.titleId} limit 1`;
    if (!title || title.merged_into_title_id) throw new Error("Canonical, active Bridge title required");
    if (actor.internalRole) {
      assertPermission(actor, "title.deliver");
    } else {
      assertPermission(actor, "title.create");
      if (title.owner_user_id !== actor.userId) throw new Error("You can request work only for your own title");
    }
    const orderId = randomUUID();
    const jobId = randomUUID();
    const step = `vendor_${data.type}`;
    await sql.transaction(async (tx) => {
      await tx`insert into streamvista_orders (id,owner_user_id,service,lane,bridge_title_id)
        values (${orderId},${title.owner_user_id},${vendorService[data.type]},'managed',${title.id})`;
      await tx`insert into streamvista_jobs (id,order_id,step,status)
        values (${jobId},${orderId},${step},'queued')`;
      await tx`insert into bridge_audit_logs (actor_user_id,action,entity_type,entity_id,metadata)
        values (${actor.userId},'vendor.job.request','vendor_job',${jobId},${JSON.stringify({ type: data.type, titleId: title.id, orderId })}::jsonb)`;
    });
    return { id: jobId, orderId, titleId: title.id, type: data.type, status: "queued" as const };
  });

export const listPersistentVendorJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "delivery.read");
    const sql = await getSql();
    const rows = actor.internalRole
      ? await sql<VendorJobRow>`select j.id,j.order_id,j.step,j.status,j.reviewer_user_id,j.reviewed_at,j.created_at,
          o.bridge_title_id as title_id,t.name as title_name,o.owner_user_id
        from streamvista_jobs j join streamvista_orders o on o.id=j.order_id
        join bridge_titles t on t.id=o.bridge_title_id
        where j.step like 'vendor_%' order by j.created_at desc limit 200`
      : await sql<VendorJobRow>`select j.id,j.order_id,j.step,j.status,j.reviewer_user_id,j.reviewed_at,j.created_at,
          o.bridge_title_id as title_id,t.name as title_name,o.owner_user_id
        from streamvista_jobs j join streamvista_orders o on o.id=j.order_id
        join bridge_titles t on t.id=o.bridge_title_id
        where j.step like 'vendor_%' and o.owner_user_id=${actor.userId}
        order by j.created_at desc limit 200`;
    return { jobs: rows.map((job) => ({
      id: job.id,
      orderId: job.order_id,
      titleId: job.title_id,
      titleName: job.title_name,
      type: job.step.replace(/^vendor_/, ""),
      status: job.status,
      reviewerUserId: job.reviewer_user_id,
      reviewedAt: job.reviewed_at,
      createdAt: job.created_at,
      canDeliver: job.status === "passed",
    })) };
  });

const vendorJobTransitionInput = z.object({
  jobId: z.string().uuid(),
  action: z.enum(["start", "submit_review", "approve", "reject"]),
  note: z.string().trim().max(1000).optional(),
});

export const transitionPersistentVendorJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(vendorJobTransitionInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const [job] = await sql<{
      id: string; order_id: string; step: string; status: string; owner_user_id: string;
    }>`select j.id,j.order_id,j.step,j.status,o.owner_user_id
      from streamvista_jobs j join streamvista_orders o on o.id=j.order_id
      where j.id=${data.jobId} and j.step like 'vendor_%' limit 1`;
    if (!job) throw new Error("Vendor job not found");
    const type = job.step.replace(/^vendor_/, "");
    const isQc = type === "human_qc";
    assertPermission(actor, isQc ? "title.qc_review" : "title.deliver");
    const transitions = {
      start: { from: "queued", to: "running" },
      submit_review: { from: "running", to: "needs_review" },
      approve: { from: "needs_review", to: "passed" },
      reject: { from: "needs_review", to: "failed" },
    } as const;
    const transition = transitions[data.action];
    if (job.status !== transition.from) throw new Error(`Job must be ${transition.from} before ${data.action}`);
    if (data.action === "approve" || data.action === "reject") {
      const [request] = await sql<{ actor_user_id: string }>`select actor_user_id from bridge_audit_logs
        where entity_type='vendor_job' and entity_id=${job.id} and action='vendor.job.request'
        order by created_at asc limit 1`;
      if (actor.userId === job.owner_user_id || actor.userId === request?.actor_user_id) {
        throw new Error("An independent reviewer must sign off; requester/title owner cannot approve");
      }
    }
    const updated = await sql.transaction(async (tx) => {
      const rows = (data.action === "approve" || data.action === "reject")
        ? await tx<{ id: string; status: string }>`update streamvista_jobs set status=${transition.to},
            reviewer_user_id=${actor.userId},reviewed_at=now()
          where id=${job.id} and status=${transition.from} returning id,status`
        : await tx<{ id: string; status: string }>`update streamvista_jobs set status=${transition.to}
          where id=${job.id} and status=${transition.from} returning id,status`;
      if (!rows[0]) throw new Error("Job changed concurrently; refresh and retry");
      await tx`insert into bridge_audit_logs (actor_user_id,action,entity_type,entity_id,metadata)
        values (${actor.userId},${`vendor.job.${data.action}`},'vendor_job',${job.id},
          ${JSON.stringify({ type, orderId: job.order_id, status: rows[0].status, note: data.note ?? null })}::jsonb)`;
      return rows[0];
    });
    return { id: updated.id, status: updated.status, canDeliver: updated.status === "passed" };
  });
