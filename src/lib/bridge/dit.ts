import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";

export const getDitAgentStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "studio") throw new Error("Studio account required");
    assertPermission(actor, "dit.agent");
    const sql = await getSql();
    const [services, payments, constraints] = await Promise.all([
      sql.unsafe(
        "select c.active as service_active,r.active as rate_active,r.base_price_paise,r.effective_from,r.effective_to from bridge_service_catalog c left join lateral (select active,base_price_paise,effective_from,effective_to from bridge_service_rates where service_code=c.code order by version desc limit 1) r on true where c.code='DIT_AGENT' limit 1",
      ) as Promise<Array<{ service_active: boolean; rate_active: boolean | null; base_price_paise: number | null; effective_from: string | Date | null; effective_to: string | Date | null }>>,
      sql.unsafe(
        "select id::text,amount_paise,verified_at from bridge_payments where user_id=$1 and purpose='DIT_AGENT' and status='captured' and verified_at is not null order by verified_at desc limit 1",
        [actor.userId],
      ) as Promise<Array<{ id: string; amount_paise: number; verified_at: string | Date }>>,
      sql.unsafe(
        "select exists(select 1 from pg_constraint where conrelid='public.bridge_dit_ingest_sessions'::regclass and pg_get_constraintdef(oid) ilike '%UPLOAD_PENDING%') as upload_pending,exists(select 1 from pg_constraint where conrelid='public.bridge_dit_storage_objects'::regclass and pg_get_constraintdef(oid) ilike '%ARCHIVE%') as archive_storage,exists(select 1 from pg_constraint where conrelid='public.bridge_dit_copy_verifications'::regclass and pg_get_constraintdef(oid) ilike '%ARCHIVE%') as archive_verification",
      ) as Promise<Array<{ upload_pending: boolean; archive_storage: boolean; archive_verification: boolean }>>,
    ]);
    const service = services[0];
    const now = Date.now();
    const starts = service?.effective_from ? new Date(service.effective_from).getTime() : 0;
    const ends = service?.effective_to ? new Date(service.effective_to).getTime() : Number.POSITIVE_INFINITY;
    const rateCurrent = Boolean(service?.rate_active) && starts <= now && ends > now;
    const schema = constraints[0];
    const schemaReady = Boolean(schema?.upload_pending && schema?.archive_storage && schema?.archive_verification);
    const payment = payments[0] ?? null;
    const serviceConfigured = Boolean(service);
    const serviceActive = Boolean(service?.service_active && rateCurrent && Number(service?.base_price_paise ?? 0) > 0);
    const blockers: string[] = [];
    if (!serviceConfigured) blockers.push("DIT_AGENT service code and price are not configured.");
    else if (!serviceActive) blockers.push("DIT_AGENT service or its rate is inactive.");
    if (!payment) blockers.push("No captured and server-verified DIT Agent Razorpay payment exists for this Studio user.");
    if (!schemaReady) blockers.push("STAGING schema does not yet support UPLOAD_PENDING plus the required third ARCHIVE copy.");
    if (!actor.organizationId) blockers.push("An active Studio organization membership is required.");
    return {
      serviceConfigured, serviceActive, amountPaise: service?.base_price_paise == null ? null : Number(service.base_price_paise),
      paid: Boolean(payment), paymentVerifiedAt: payment?.verified_at ?? null,
      schemaReady, organizationReady: Boolean(actor.organizationId),
      uploadEnabled: false,
      blockers,
    };
  });

export const listDitIngestSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "studio") throw new Error("Studio account required");
    assertPermission(actor, "dit.agent");
    if (!actor.organizationId) return { sessions: [] };
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select id::text,title_id,camera_unit,camera_label,card_label,shoot_date,source_volume,source_root,source_manifest_sha256,source_file_count,source_total_bytes,status,signed_off_by,signed_off_at,created_at from bridge_dit_ingest_sessions where organization_id=$1 order by created_at desc limit 100",
      [actor.organizationId],
    );
    return { sessions: JSON.parse(JSON.stringify(rows)) };
  });
