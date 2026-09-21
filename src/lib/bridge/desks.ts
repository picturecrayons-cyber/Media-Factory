import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireActor } from "./session";
import { assertPermission, canReadTitle } from "./rbac";
import { loadTitle, recordTransition } from "./titles";
import { writeAudit } from "./audit";
import { rightsAreEvidenced } from "./blockers";

const QC_DECISIONS = ["pass", "fail", "request_changes"] as const;

export const submitQcReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      decision: z.enum(QC_DECISIONS),
      notes: z.string().max(2000).optional(),
      picture: z.boolean(),
      sound: z.boolean(),
      text: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.qc_review");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    if (title.status !== "QC_REVIEW") throw new Error("Title is not in QC review");
    if (data.decision !== "pass" && !(data.notes ?? "").trim()) {
      throw new Error("QC fail and change requests need a reason");
    }
    if (data.decision === "pass" && !(data.picture && data.sound && data.text)) {
      throw new Error("QC pass requires the checklist");
    }
    const id = randomBytes(16).toString("hex");
    const sql = await getSql();
    await sql`
      insert into bridge_qc_reviews (id, title_id, decision, checklist, notes, actor_user_id)
      values (
        ${id}, ${title.id}, ${data.decision},
        ${JSON.stringify({ picture: data.picture, sound: data.sound, text: data.text })},
        ${data.notes ?? ""}, ${actor.userId}
      )
    `;
    if (data.decision === "pass") {
      await recordTransition({
        titleId: title.id,
        from: "QC_REVIEW",
        to: "RIGHTS_REVIEW",
        actorUserId: actor.userId,
        note: data.notes ?? "QC pass",
      });
    }
    await writeAudit({
      actorUserId: actor.userId,
      actorRole: actor.internalRole,
      action: data.decision === "pass" ? "QC_APPROVED" : data.decision === "fail" ? "QC_REJECTED" : "QC_SUBMITTED",
      entityType: "bridge_title",
      entityId: title.id,
      previousState: "QC_REVIEW",
      newState: data.decision === "pass" ? "RIGHTS_REVIEW" : "QC_REVIEW",
      reason: data.notes ?? null,
    });
    return { title: await loadTitle(title.id) };
  });

export const saveTitleRights = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      territories: z.string().min(2).max(400),
      rightsType: z.string().min(2).max(80),
      mediaType: z.string().min(2).max(80),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      exclusive: z.boolean(),
      exclusions: z.string().max(1000).optional(),
      chainOfTitleStatus: z.enum(["unverified", "partial", "verified"]),
      evidenceNote: z.string().min(8).max(2000),
      approve: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    if (title.status !== "RIGHTS_REVIEW" && title.status !== "LICENSING_READY") {
      throw new Error("Title is not in rights review");
    }
    const snapshot = {
      approvedAt: data.approve ? new Date().toISOString() : null,
      chainOfTitleStatus: data.chainOfTitleStatus,
      endDate: data.endDate ?? null,
      territories: data.territories,
      rightsType: data.rightsType,
      mediaType: data.mediaType,
      evidenceNote: data.evidenceNote,
    };
    if (data.approve && !rightsAreEvidenced(snapshot)) {
      throw new Error("Rights approved requires evidence, not a cosmetic toggle");
    }
    const sql = await getSql();
    await sql`
      insert into bridge_title_rights (
        title_id, territories, rights_type, media_type, start_date, end_date,
        exclusive, exclusions, chain_of_title_status, evidence_note, approved_by, approved_at, updated_at
      ) values (
        ${title.id}, ${data.territories}, ${data.rightsType}, ${data.mediaType},
        ${data.startDate || null}, ${data.endDate || null}, ${data.exclusive},
        ${data.exclusions ?? ""}, ${data.chainOfTitleStatus}, ${data.evidenceNote},
        ${data.approve ? actor.userId : null}, ${data.approve ? new Date().toISOString() : null}, now()
      )
      on conflict (title_id) do update set
        territories = excluded.territories,
        rights_type = excluded.rights_type,
        media_type = excluded.media_type,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        exclusive = excluded.exclusive,
        exclusions = excluded.exclusions,
        chain_of_title_status = excluded.chain_of_title_status,
        evidence_note = excluded.evidence_note,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        updated_at = now()
    `;
    if (data.approve && title.status === "RIGHTS_REVIEW") {
      await recordTransition({
        titleId: title.id,
        from: "RIGHTS_REVIEW",
        to: "LICENSING_READY",
        actorUserId: actor.userId,
        note: "rights approved",
      });
    }
    await writeAudit({
      actorUserId: actor.userId,
      actorRole: actor.internalRole,
      action: data.approve ? "RIGHTS_APPROVED" : "RIGHTS_SUBMITTED",
      entityType: "bridge_title",
      entityId: title.id,
      previousState: title.status,
      newState: data.approve ? "LICENSING_READY" : title.status,
      reason: data.evidenceNote,
    });
    return { title: await loadTitle(title.id) };
  });

export const listFinancePayments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireActor(context.userId);
    assertPermission(actor, "finance.read");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string | null;
      user_id: string;
      amount_paise: number;
      status: string;
      provider_order_id: string | null;
      provider_payment_id: string | null;
      created_at: string | Date;
    }>`
      select id, title_id, user_id, amount_paise, status, provider_order_id, provider_payment_id, created_at
      from bridge_payments order by created_at desc limit 100
    `;
    return {
      payments: rows.map((r) => ({
        id: r.id,
        titleId: r.title_id,
        userId: r.user_id,
        amountPaise: r.amount_paise,
        status: r.status,
        orderId: r.provider_order_id,
        paymentId: r.provider_payment_id,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
    };
  });

export const authorizeDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8), recipientUserId: z.string().min(4) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.deliver");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (title.status !== "LICENSED") throw new Error("Delivery requires a valid license");
    const sql = await getSql();
    const ents = await sql<{ payment_id: string }>`
      select payment_id from bridge_entitlements
      where user_id = ${data.recipientUserId} and title_id = ${title.id} and access_type = 'license'
      limit 1
    `;
    const paymentId = ents[0]?.payment_id;
    if (!paymentId) throw new Error("License entitlement required");
    const paid = await sql<{ status: string }>`
      select status from bridge_payments where id = ${paymentId} limit 1
    `;
    if (paid[0]?.status !== "captured") throw new Error("Payment not captured");
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_deliveries (
        id, title_id, payment_id, recipient_user_id, method, status, actor_user_id, started_at
      ) values (
        ${id}, ${title.id}, ${paymentId}, ${data.recipientUserId}, ${"s3_signed"}, ${"started"},
        ${actor.userId}, now()
      )
      on conflict (title_id, payment_id) do nothing
    `;
    await recordTransition({
      titleId: title.id,
      from: "LICENSED",
      to: "DELIVERED",
      actorUserId: actor.userId,
      note: "delivery authorized",
    });
    await writeAudit({
      actorUserId: actor.userId,
      actorRole: actor.internalRole,
      action: "DELIVERY_STARTED",
      entityType: "bridge_delivery",
      entityId: id,
      previousState: "LICENSED",
      newState: "DELIVERED",
      reason: "server-authorized delivery after captured payment",
    });
    return { deliveryId: id, title: await loadTitle(title.id) };
  });
