import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, canReadTitle } from "./rbac";
import { assertNotDevUser } from "./guards";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { saveLoopLicense } from "./workflow";
import { loopLicenseInput } from "./workflow-policy";
import { verifyDistributionPreflight } from "./loop-publication";
import { currentDeliverySnapshot, latestLoopDelivery } from "./loop-delivery-core";
import { assertDeliveryReview, assertDeliveryUnchanged } from "./loop-delivery-policy";

const titleInput = z.object({ titleId: z.string().min(8) });
const modelInput = z.enum(["TVOD", "AVOD"]);

async function lockTitle(tx: Sql, titleId: string) {
  const rows = await tx`select id from bridge_titles where id=${titleId} for update`;
  if (!rows.length) throw new Error("Not found");
}
async function deliveryAudit(tx: Sql, userId: string, titleId: string, action: string, metadata: Record<string, unknown>) {
  await writeAudit({ actorUserId: userId, action, entityType: "bridge_title", entityId: titleId, metadata }, tx);
}

// Reuse immutable license drafting and its ownership checks. Only the distribution model
// changes, in the same transaction, before any independent legal review can see the draft.
export const submitManualLoopLicense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ terms: loopLicenseInput, model: modelInput }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    return (await getSql()).transaction(async (tx) => {
      const saved = await saveLoopLicense(tx, actor, data.terms);
      await tx`update bridge_rights_grants set media=${JSON.stringify(["CRAYONS_LOOP", data.model])}::jsonb where id=${saved.grantId}`;
      await deliveryAudit(tx, actor.userId, data.terms.titleId, "license.loop_model", { ...saved, model: data.model });
      return saved;
    });
  });

export const getManualLoopDelivery = createServerFn({ method: "GET" })
  .middleware([authMiddleware]).validator(titleInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title) || (!actor.internalRole && actor.accountType === "buyer"))
      throw new Error("Not found");
    const sql = await getSql();
    const deliveries = await sql<{ id: string; version: number; status: string; model: "TVOD" | "AVOD"; manifest: import("./loop-delivery-core").DeliveryManifest; prepared_by: string; delivered_by: string | null; handoff_reference: string | null; approval_reference: string | null; review_note: string | null }>`
      select id,version,status,model,manifest,prepared_by,delivered_by,handoff_reference,approval_reference,review_note
      from bridge_loop_deliveries where title_id=${data.titleId} order by version desc limit 20`;
    const grants = await sql<{ id: string; status: string; media: string[]; territories: string[]; languages: string[]; evidence: Array<{ agreementReference?: string }>; window_start: string | Date | null; window_end: string | Date | null }>`
      select id,status,media,territories,languages,evidence,window_start,window_end from bridge_rights_grants
      where title_id=${data.titleId} and media @> '["CRAYONS_LOOP"]'::jsonb order by created_at desc`;
    return { deliveries, grants: grants.map((g) => ({ ...g,
      window_start: g.window_start ? new Date(g.window_start).toISOString() : null,
      window_end: g.window_end ? new Date(g.window_end).toISOString() : null })) };
  });

export const prepareManualLoopDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(titleInput.extend({ grantId: z.string().uuid(), model: modelInput }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.deliver");
    return (await getSql()).transaction(async (tx) => {
      await lockTitle(tx, data.titleId);
      const snapshot = await currentDeliverySnapshot(tx, data.titleId, data.grantId, data.model);
      const preflight = await verifyDistributionPreflight(tx, data.titleId, snapshot.manifest.request);
      if (!preflight.eligible || preflight.rightsGrantId !== data.grantId)
        throw new Error(`Delivery blocked: ${preflight.reasons.join(" · ") || "Select the current covering approved license"}`);
      const latest = await latestLoopDelivery(tx, data.titleId);
      const version = (latest?.version ?? 0) + 1;
      const [saved] = await tx<{ id: string }>`insert into bridge_loop_deliveries
        (title_id,version,rights_grant_id,model,snapshot_hash,manifest,prepared_by)
        values (${data.titleId},${version},${data.grantId},${data.model},${snapshot.hash},${JSON.stringify(snapshot.manifest)}::jsonb,${actor.userId}) returning id`;
      await deliveryAudit(tx, actor.userId, data.titleId, "distribution.loop_prepare_manual", { deliveryId: saved.id, version, model: data.model });
      return { id: saved.id, version };
    });
  });

export const recordManualLoopDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(titleInput.extend({ deliveryId: z.string().uuid(), reference: z.string().trim().min(8).max(500) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.deliver");
    return (await getSql()).transaction(async (tx) => {
      await lockTitle(tx, data.titleId);
      const delivery = await latestLoopDelivery(tx, data.titleId);
      if (!delivery || delivery.id !== data.deliveryId || delivery.status !== "PREPARED")
        throw new Error("Only the latest prepared package can be marked delivered");
      const snapshot = await currentDeliverySnapshot(tx, data.titleId, delivery.rights_grant_id, delivery.model);
      assertDeliveryUnchanged(delivery.snapshot_hash, snapshot.hash);
      const preflight = await verifyDistributionPreflight(tx, data.titleId, snapshot.manifest.request);
      if (!preflight.eligible || preflight.rightsGrantId !== delivery.rights_grant_id)
        throw new Error(`Delivery blocked: ${preflight.reasons.join(" · ")}`);
      await tx`update bridge_loop_deliveries set status='DELIVERED',delivered_by=${actor.userId},delivered_at=now(),handoff_reference=${data.reference} where id=${delivery.id}`;
      await deliveryAudit(tx, actor.userId, data.titleId, "distribution.loop_delivered_manual", { deliveryId: delivery.id, reference: data.reference });
      return { status: "DELIVERED" as const };
    });
  });

export const reviewManualLoopDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(titleInput.extend({ deliveryId: z.string().uuid(), decision: z.enum(["APPROVE", "REJECT"]),
    note: z.string().trim().min(8).max(2000), reference: z.string().trim().min(8).max(500) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    return (await getSql()).transaction(async (tx) => {
      await lockTitle(tx, data.titleId);
      const delivery = await latestLoopDelivery(tx, data.titleId);
      if (!delivery || delivery.id !== data.deliveryId) throw new Error("Review the latest delivery package");
      assertDeliveryReview(delivery.status, delivery.prepared_by, delivery.delivered_by, actor.userId);
      if (data.decision === "APPROVE") {
        const snapshot = await currentDeliverySnapshot(tx, data.titleId, delivery.rights_grant_id, delivery.model);
        assertDeliveryUnchanged(delivery.snapshot_hash, snapshot.hash);
        const preflight = await verifyDistributionPreflight(tx, data.titleId, snapshot.manifest.request);
        if (!preflight.eligible || preflight.rightsGrantId !== delivery.rights_grant_id)
          throw new Error(`Acceptance blocked: ${preflight.reasons.join(" · ")}`);
      }
      const status = data.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx`update bridge_loop_deliveries set status=${status},reviewed_by=${actor.userId},reviewed_at=now(),review_note=${data.note},approval_reference=${data.reference} where id=${delivery.id}`;
      await deliveryAudit(tx, actor.userId, data.titleId, "distribution.loop_review_manual", { deliveryId: delivery.id, status, reference: data.reference, note: data.note });
      return { status };
    });
  });
