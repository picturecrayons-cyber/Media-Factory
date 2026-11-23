import { createServerFn } from "@tanstack/react-start";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission, canOperateOnTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertServiceRequestTransition, type ServiceRequestStatus } from "./service-request-workflow";

const createSchema = z.object({
  titleId: z.string().min(8).max(100),
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(4000),
  documentIds: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

const requestSelect = `
  select r.id, r.requester_user_id, r.requester_account_type, r.organization_id,
    r.title_id, t.name as title_name, r.category, r.description,
    r.attachment_document_ids, r.status, r.assigned_provider,
    r.delivery_evidence_url, r.created_at, r.updated_at,
    q.id as quote_id, q.quote_number, q.status as quote_status,
    q.subtotal_paise, q.tax_paise, q.total_paise,
    o.id as order_id, o.status as order_status,
    i.invoice_number, i.status as invoice_status
  from public.bridge_service_requests r
  join public.bridge_titles t on t.id = r.title_id
  left join public.bridge_service_quotes q on q.id = r.quote_id
  left join public.bridge_service_orders o on o.id = r.order_id
  left join public.bridge_service_invoices i on i.order_id = o.id
`;

type RequestRow = {
  id: string;
  requester_user_id: string;
  requester_account_type: string;
  organization_id: string | null;
  title_id: string;
  title_name: string;
  category: string;
  description: string;
  attachment_document_ids: string[];
  status: ServiceRequestStatus;
  assigned_provider: string | null;
  delivery_evidence_url: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  quote_id: string | null;
  quote_number: string | null;
  quote_status: string | null;
  subtotal_paise: number | null;
  tax_paise: number | null;
  total_paise: number | null;
  order_id: string | null;
  order_status: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
};

function iso(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

async function mapRequests(rows: RequestRow[]) {
  if (!rows.length) return [];
  const sql = await getSql();
  const ids = rows.map((row) => row.id);
  const events = await sql.query<{
    id: string; request_id: string; from_status: string | null; to_status: string;
    actor_user_id: string | null; note: string | null; created_at: string | Date;
  }>(
    "select id,request_id,from_status,to_status,actor_user_id,note,created_at from public.bridge_service_request_events where request_id=any($1::uuid[]) order by created_at asc",
    [ids],
  );
  const eventMap = new Map<string, typeof events>();
  for (const event of events) eventMap.set(event.request_id, [...(eventMap.get(event.request_id) ?? []), event]);
  return rows.map((row) => ({
    id: row.id,
    requesterUserId: row.requester_user_id,
    requesterAccountType: row.requester_account_type,
    organizationId: row.organization_id,
    titleId: row.title_id,
    titleName: row.title_name,
    category: row.category,
    description: row.description,
    attachmentDocumentIds: row.attachment_document_ids ?? [],
    status: row.status,
    assignedProvider: row.assigned_provider,
    deliveryEvidenceUrl: row.delivery_evidence_url,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    quote: row.quote_id ? {
      id: row.quote_id,
      number: row.quote_number,
      status: row.quote_status,
      subtotalPaise: Number(row.subtotal_paise ?? 0),
      taxPaise: Number(row.tax_paise ?? 0),
      totalPaise: Number(row.total_paise ?? 0),
    } : null,
    order: row.order_id ? { id: row.order_id, status: row.order_status } : null,
    invoice: row.invoice_number ? { number: row.invoice_number, status: row.invoice_status } : null,
    events: (eventMap.get(row.id) ?? []).map((event) => ({
      id: event.id,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      actorUserId: event.actor_user_id,
      note: event.note,
      createdAt: iso(event.created_at),
    })),
  }));
}

async function addEventAndNotification(
  tx: Awaited<ReturnType<typeof getSql>>,
  request: { id: string; requester_user_id: string; organization_id: string | null },
  actorUserId: string,
  from: string | null,
  to: string,
  note: string,
) {
  await tx.query(
    "insert into public.bridge_service_request_events(id,request_id,from_status,to_status,actor_user_id,note) values($1,$2,$3,$4,$5,$6)",
    [randomUUID(), request.id, from, to, actorUserId, note],
  );
  await tx.query(
    "insert into public.bridge_service_request_notifications(id,request_id,recipient_user_id,title,message) values($1,$2,$3,$4,$5)",
    [randomUUID(), request.id, request.requester_user_id, "Service request updated", note || `Your service request is now ${to.replaceAll("_", " ")}.`],
  );
  if (request.organization_id) {
    await tx.query(
      "insert into public.bridge_service_request_notifications(id,request_id,organization_id,title,message) values($1,$2,$3,$4,$5)",
      [randomUUID(), request.id, request.organization_id, "Studio service request updated", note || `A service request is now ${to.replaceAll("_", " ")}.`],
    );
  }
}

export const createBridgeServiceRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Only Creator and Studio accounts can request services");
    }
    assertPermission(actor, "service.request_create");
    if (actor.accountType === "studio" && !actor.organizationId) {
      throw new Error("An active Studio organization membership is required");
    }
    const title = await loadTitle(data.titleId);
    if (!title || !canOperateOnTitle(actor, title, "service.request_create")) {
      throw new Error("You can request services only for your own authorized title or Studio organization");
    }
    const sql = await getSql();
    const eligible = await sql.query<{ id: string }>(
      "select id from public.bridge_titles where id=$1 and submission_type='finished_film' limit 1",
      [title.id],
    );
    if (!eligible[0]) throw new Error("Service requests are available only for finished-film titles. Story Concepts use their separate submission workflow.");

    const documentIds = [...new Set(data.documentIds)];
    if (documentIds.length) {
      const documents = await sql.query<{ id: string }>(
        "select id from public.bridge_creator_documents where id=any($1::text[]) and status='VERIFIED' and (owner_user_id=$2 or ($3::uuid is not null and owner_organization_id=$3::uuid))",
        [documentIds, actor.userId, actor.accountType === "studio" ? actor.organizationId : null],
      );
      if (documents.length !== documentIds.length) {
        throw new Error("One or more attached Document Vault records are unavailable or not verified for this account");
      }
    }

    const id = randomUUID();
    await sql.transaction(async (tx) => {
      await tx.query(
        "insert into public.bridge_service_requests(id,requester_user_id,requester_account_type,organization_id,title_id,category,description,attachment_document_ids,status) values($1,$2,$3,$4,$5,$6,$7,$8,'SUBMITTED')",
        [id, actor.userId, actor.accountType, actor.accountType === "studio" ? actor.organizationId : null, title.id, data.category, data.description, documentIds],
      );
      await addEventAndNotification(tx, {
        id,
        requester_user_id: actor.userId,
        organization_id: actor.accountType === "studio" ? actor.organizationId ?? null : null,
      }, actor.userId, null, "SUBMITTED", "Your service request was submitted to the Super Admin review queue.");
    });
    await writeAudit({
      actorUserId: actor.userId,
      action: "service.request_submitted",
      entityType: "bridge_service_request",
      entityId: id,
      metadata: { titleId: title.id, category: data.category, attachmentCount: documentIds.length },
    });
    return { requestId: id, status: "SUBMITTED" as const };
  });

export const listMyBridgeServiceRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Creator or Studio account required");
    }
    assertPermission(actor, "service.request_read");
    const sql = await getSql();
    const rows = await sql.query<RequestRow>(
      requestSelect + " where r.requester_user_id=$1 or ($2::uuid is not null and r.organization_id=$2::uuid) order by r.created_at desc limit 100",
      [actor.userId, actor.accountType === "studio" ? actor.organizationId ?? null : null],
    );
    const requests = await mapRequests(rows);
    const notifications = await sql.query<{
      id: string; request_id: string; title: string; message: string; read_at: string | Date | null; created_at: string | Date;
    }>(
      "select id,request_id,title,message,read_at,created_at from public.bridge_service_request_notifications where recipient_user_id=$1 or ($2::uuid is not null and organization_id=$2::uuid) order by created_at desc limit 40",
      [actor.userId, actor.accountType === "studio" ? actor.organizationId ?? null : null],
    );
    return {
      requests,
      notifications: notifications.map((item) => ({
        id: item.id, requestId: item.request_id, title: item.title, message: item.message,
        readAt: iso(item.read_at), createdAt: iso(item.created_at),
      })),
    };
  });

export const listBridgeServiceRequestQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "service.request_manage");
    const sql = await getSql();
    const rows = await sql.query<RequestRow>(
      requestSelect + " order by case when r.status in ('SUBMITTED','UNDER_REVIEW') then 0 when r.status in ('QUOTE_READY','AWAITING_PAYMENT') then 1 else 2 end, r.created_at asc limit 300",
      [],
    );
    const serviceOptions = await sql.query<{ code: string; name: string; category: string }>(
      "select code,name,category from public.bridge_service_catalog where active=true and customer_visible=true order by category,name",
      [],
    );
    return { requests: await mapRequests(rows), serviceOptions };
  });

export const createBridgeServiceRequestQuote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    requestId: z.string().uuid(),
    serviceCode: z.string().trim().min(2).max(80),
    description: z.string().trim().min(4).max(240),
    subtotalPaise: z.number().int().positive().max(100000000000),
    expiresAt: z.string().datetime().optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "service.request_manage");
    const sql = await getSql();
    const result = await sql.transaction(async (tx) => {
      const found = await tx.query<{
        id: string; requester_user_id: string; title_id: string; status: ServiceRequestStatus;
        organization_id: string | null; quote_id: string | null;
      }>("select id,requester_user_id,title_id,status,organization_id,quote_id from public.bridge_service_requests where id=$1 for update", [data.requestId]);
      const request = found[0];
      if (!request || !["SUBMITTED", "UNDER_REVIEW"].includes(request.status) || request.quote_id) {
        throw new Error("Request is not ready for a new quote");
      }
      const catalog = await tx.query<{ code: string; name: string; classification: string; pricing_method: string; unit_label: string }>(
        "select code,name,classification,pricing_method,unit_label from public.bridge_service_catalog where code=$1 and active=true and customer_visible=true limit 1",
        [data.serviceCode],
      );
      if (!catalog[0]) throw new Error("Service is not active for customer quotes");
      const taxRows = await tx.query<{ id: string; rate_percent: number }>(
        "select id,rate_percent from public.bridge_tax_rates where active=true and currency='INR' and effective_from<=now() and (effective_to is null or effective_to>now()) order by effective_from desc limit 1",
        [],
      );
      if (!taxRows[0]) throw new Error("Finance has not configured an active INR tax rate; quote creation is blocked");
      const taxRate = Number(taxRows[0].rate_percent);
      const taxPaise = Math.round(data.subtotalPaise * taxRate / 100);
      const totalPaise = data.subtotalPaise + taxPaise;
      const quoteNumber = "CRQ-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomBytes(4).toString("hex").toUpperCase();
      const quote = await tx.query<{ id: string }>(
        "insert into public.bridge_service_quotes(quote_number,user_id,title_id,status,selected_destinations,detected_assets,required_work,pricing_snapshot,subtotal_paise,tax_paise,total_paise,estimated_cost_paise,estimated_margin_paise,expires_at) values($1,$2,$3,'QUOTED','[]'::jsonb,'[]'::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8,0,0,$9) returning id",
        [
          quoteNumber, request.requester_user_id, request.title_id,
          JSON.stringify([{ serviceCode: catalog[0].code, description: data.description, quantity: 1 }]),
          JSON.stringify({ source: "super_admin_manual_quote", serviceRequestId: request.id, taxRateId: taxRows[0].id, taxRatePercent: taxRate, costBasisConfigured: false }),
          data.subtotalPaise, taxPaise, totalPaise, data.expiresAt ?? null,
        ],
      );
      await tx.query(
        "insert into public.bridge_service_quote_lines(quote_id,service_code,classification,pricing_method,unit_label,quantity,unit_price_paise,line_total_paise,cost_basis_paise,estimated_margin_paise,evidence,pricing_snapshot) values($1,$2,$6,'CUSTOM_QUOTE','service',1,$3,$3,0,0,$4::jsonb,$5::jsonb)",
        [quote[0].id, catalog[0].code, data.subtotalPaise, JSON.stringify({ serviceRequestId: request.id, description: data.description }), JSON.stringify({ manualQuote: true, taxRateId: taxRows[0].id }), catalog[0].classification],
      );
      await tx.query(
        "update public.bridge_service_requests set status='QUOTE_READY',quote_id=$1,updated_at=now() where id=$2",
        [quote[0].id, request.id],
      );
      await addEventAndNotification(tx, request, actor.userId, request.status, "QUOTE_READY", "A service quote is ready for your review.");
      return { quoteId: quote[0].id, quoteNumber, subtotalPaise: data.subtotalPaise, taxPaise, totalPaise };
    });
    await writeAudit({
      actorUserId: actor.userId, action: "service.request_quote_created",
      entityType: "bridge_service_request", entityId: data.requestId,
      metadata: { quoteId: result.quoteId, quoteNumber: result.quoteNumber, subtotalPaise: result.subtotalPaise, taxPaise: result.taxPaise, totalPaise: result.totalPaise },
    });
    return result;
  });

export const transitionBridgeServiceRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    requestId: z.string().uuid(),
    toStatus: z.enum(["UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"]),
    provider: z.string().trim().min(2).max(160).optional(),
    deliveryEvidenceUrl: z.string().url().max(2048).optional(),
    note: z.string().trim().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "service.request_manage");
    const sql = await getSql();
    const result = await sql.transaction(async (tx) => {
      const found = await tx.query<{
        id: string; requester_user_id: string; organization_id: string | null;
        status: ServiceRequestStatus; order_id: string | null; quote_id: string | null;
      }>("select id,requester_user_id,organization_id,status,order_id,quote_id from public.bridge_service_requests where id=$1 for update", [data.requestId]);
      const request = found[0];
      if (!request) throw new Error("Service request not found");
      assertServiceRequestTransition(request.status, data.toStatus);
      if (data.toStatus === "ASSIGNED" && !data.provider) throw new Error("A named provider is required");
      if (data.toStatus === "COMPLETED") {
        if (!data.deliveryEvidenceUrl || new URL(data.deliveryEvidenceUrl).protocol !== "https:") {
          throw new Error("HTTPS delivery evidence is required before completion");
        }
        if (!request.order_id) throw new Error("A paid service order is required before completion");
        const invoices = await tx.query<{ status: string }>(
          "select status from public.bridge_service_invoices where order_id=$1 limit 1",
          [request.order_id],
        );
        if (invoices[0]?.status !== "PAID") throw new Error("A verified paid invoice is required before completion");
      }
      if (data.toStatus === "IN_PROGRESS" || data.toStatus === "COMPLETED") {
        if (!request.order_id) throw new Error("Service order is not linked");
        const orderStatus = data.toStatus;
        const updated = await tx.query<{ id: string }>(
          "update public.bridge_service_orders set status=$1,updated_at=now() where id=$2 and status=$3 returning id",
          [orderStatus, request.order_id, data.toStatus === "IN_PROGRESS" ? "PAID" : "IN_PROGRESS"],
        );
        if (!updated[0]) throw new Error("Service order is not in the required state");
        if (data.toStatus === "COMPLETED") {
          await tx.query("update public.bridge_service_requests set delivery_evidence_url=$1 where id=$2", [data.deliveryEvidenceUrl, request.id]);
        }
        return { id: request.id, status: data.toStatus };
      }
      if (data.toStatus === "CANCELLED" && request.order_id) {
        if (request.quote_id) {
          await tx.query("update public.bridge_service_quotes set status='CANCELLED',updated_at=now() where id=$1 and status in ('QUOTED','ACCEPTED')", [request.quote_id]);
        }
        const cancelled = await tx.query<{ id: string }>(
          "update public.bridge_service_orders set status='CANCELLED',updated_at=now() where id=$1 and status='PAYMENT_PENDING' returning id",
          [request.order_id],
        );
        if (!cancelled[0]) throw new Error("Only an unpaid pending service order can be cancelled");
        return { id: request.id, status: "CANCELLED" as const };
      }
      if (data.toStatus === "CANCELLED" && request.quote_id) {
        await tx.query("update public.bridge_service_quotes set status='CANCELLED',updated_at=now() where id=$1 and status='QUOTED'", [request.quote_id]);
      }
      await tx.query(
        "update public.bridge_service_requests set status=$1,assigned_provider=coalesce($2,assigned_provider),updated_at=now() where id=$3",
        [data.toStatus, data.provider ?? null, request.id],
      );
      await addEventAndNotification(tx, request, actor.userId, request.status, data.toStatus, data.note ?? `Service request moved to ${data.toStatus.replaceAll("_", " ")}.`);
      return { id: request.id, status: data.toStatus };
    });
    await writeAudit({
      actorUserId: actor.userId, action: "service.request_status_changed",
      entityType: "bridge_service_request", entityId: data.requestId,
      metadata: { toStatus: data.toStatus, provider: data.provider ?? null, deliveryEvidenceUrl: data.deliveryEvidenceUrl ?? null },
    });
    return result;
  });

export const markBridgeServiceNotificationRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ notificationId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) throw new Error("Creator or Studio account required");
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      "update public.bridge_service_request_notifications set read_at=now() where id=$1 and (recipient_user_id=$2 or ($3::uuid is not null and organization_id=$3::uuid)) returning id",
      [data.notificationId, actor.userId, actor.accountType === "studio" ? actor.organizationId ?? null : null],
    );
    if (!rows[0]) throw new Error("Notification not found");
    return { id: rows[0].id, read: true };
  });
