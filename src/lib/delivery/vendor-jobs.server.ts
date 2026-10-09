import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission, hasPermission } from "@/lib/bridge/rbac";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { writeAudit } from "@/lib/bridge/audit";
import { VENDOR_JOB_TYPES, SERVICE_PRICE_GUIDANCE, type VendorJobType } from "./vendor-jobs";

const createSchema = z.object({
  titleId: z.string().min(8).max(128),
  type: z.enum(VENDOR_JOB_TYPES),
  serviceLane: z.enum(["self_service", "managed"]).default("managed"),
  scope: z.record(z.string(), z.unknown()).default({}),
  note: z.string().max(2000).default(""),
  idempotencyKey: z.string().uuid(),
});

function canRequestVendorJob(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  return hasPermission(actor, "title.deliver") ||
    hasPermission(actor, "title.create") ||
    hasPermission(actor, "service.quote_create") ||
    hasPermission(actor, "service.order_create");
}

export const listVendorServiceCatalog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!canRequestVendorJob(actor)) assertPermission(actor, "delivery.read");
    const sql = await getSql();
    const configured = await sql<{
      id: string;
      service_type: VendorJobType;
      display_name: string;
      pricing_unit: string;
      indicative_min_paise: number | string | null;
      indicative_max_paise: number | string | null;
      quote_required: boolean;
      pricing_basis: string;
      source_url: string | null;
      version: number;
    }>`select id,service_type,display_name,pricing_unit,indicative_min_paise,indicative_max_paise,quote_required,pricing_basis,source_url,version
       from bridge_vendor_service_catalog
       where active = true and effective_from <= now() and (effective_to is null or effective_to > now())
       order by service_type, display_name`;
    return {
      catalog: configured.map((item) => ({
        id: item.id,
        serviceType: item.service_type,
        displayName: item.display_name,
        pricingUnit: item.pricing_unit,
        indicativeMinPaise: item.indicative_min_paise == null ? null : Number(item.indicative_min_paise),
        indicativeMaxPaise: item.indicative_max_paise == null ? null : Number(item.indicative_max_paise),
        quoteRequired: item.quote_required,
        priceBasis: item.pricing_basis,
        sourceUrl: item.source_url,
        version: item.version,
      })),
      fallbackGuidance: SERVICE_PRICE_GUIDANCE,
      pricesAreIndicative: true,
    };
  });

export const listVendorJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const internalCatalogAccess = Boolean(actor.internalRole && hasPermission(actor, "title.read_catalog"));
    const rows = internalCatalogAccess
      ? await sql<any>`select j.*, t.name as title_name from bridge_vendor_jobs j join bridge_titles t on t.id=j.title_id order by j.created_at desc limit 250`
      : await sql<any>`select j.*, t.name as title_name from bridge_vendor_jobs j join bridge_titles t on t.id=j.title_id where j.requested_by=${actor.userId} or t.owner_user_id=${actor.userId} order by j.created_at desc limit 250`;
    return {
      jobs: rows.map((r) => ({
        id: r.id,
        titleId: r.title_id,
        titleName: r.title_name,
        type: r.job_type,
        status: r.status,
        serviceLane: r.service_lane,
        scope: r.scope,
        note: r.scope?.note ?? "",
        requestedBy: r.requested_by,
        assignedVendorId: r.assigned_vendor_id,
        indicativeMinPaise: r.indicative_min_paise == null ? null : Number(r.indicative_min_paise),
        indicativeMaxPaise: r.indicative_max_paise == null ? null : Number(r.indicative_max_paise),
        paymentStatus: r.payment_status,
        paymentOrderId: r.payment_order_id,
        deliverableAvailable: Boolean(r.deliverable_asset_key),
        signedOff: Boolean(r.signoff_at),
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      })),
    };
  });

export const createPersistentVendorJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!canRequestVendorJob(actor)) throw new Error("Forbidden");
    const sql = await getSql();
    const canReadCatalog = Boolean(actor.internalRole && hasPermission(actor, "title.read_catalog"));
    const titleRows = canReadCatalog
      ? await sql<{ id: string; name: string; owner_user_id: string }>`select id,name,owner_user_id from bridge_titles where id=${data.titleId} limit 1`
      : await sql<{ id: string; name: string; owner_user_id: string }>`select id,name,owner_user_id from bridge_titles where id=${data.titleId} and owner_user_id=${actor.userId} limit 1`;
    const title = titleRows[0];
    if (!title) throw new Error("Title not found or access denied");
    const existing = await sql<{ id: string; status: string }>`select id,status from bridge_vendor_jobs where idempotency_key=${data.idempotencyKey} limit 1`;
    if (existing[0]) return { jobId: existing[0].id, status: existing[0].status, duplicate: true };
    const price = SERVICE_PRICE_GUIDANCE.find((p) => p.serviceType === data.type);
    const rows = await sql<{ id: string }>`
      insert into bridge_vendor_jobs
        (title_id,job_type,status,service_lane,scope,requested_by,indicative_min_paise,indicative_max_paise,idempotency_key)
      values
        (${data.titleId},${data.type},'requested',${data.serviceLane},${JSON.stringify({ ...data.scope, note: data.note })}::jsonb,${actor.userId},
         ${price?.minPaise ?? null},${price?.maxPaise ?? null},${data.idempotencyKey})
      returning id`;
    const jobId = rows[0]?.id;
    if (!jobId) throw new Error("Vendor job insert failed");
    await sql`insert into bridge_vendor_job_events(job_id,actor_user_id,event_type,from_status,to_status,note,metadata)
      values (${jobId},${actor.userId},'job_requested',null,'requested',${data.note || null},
        ${JSON.stringify({ type: data.type, serviceLane: data.serviceLane, titleId: data.titleId, priceBasis: 'indicative_market_estimate' })}::jsonb)`;
    await writeAudit({
      actorUserId: actor.userId,
      action: "vendor_job.requested",
      entityType: "bridge_vendor_job",
      entityId: jobId,
      metadata: { titleId: data.titleId, type: data.type, serviceLane: data.serviceLane },
    });
    // Never report successful StreamVista routing until a receiver endpoint responds successfully.
    return { jobId, status: "requested", duplicate: false, streamVistaState: "not_connected" as const };
  });
