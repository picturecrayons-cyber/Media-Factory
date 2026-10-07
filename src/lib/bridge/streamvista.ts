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
