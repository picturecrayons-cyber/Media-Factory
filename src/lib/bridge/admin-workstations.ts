import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission, canAccessAdminWorkstations } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { reviewWorkflow } from "./workflow";

async function actorFor(userId: string) {
  assertNotDevUser(userId);
  return requireVerifiedActor(userId);
}

export const listAdminWorkstations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    if (!canAccessAdminWorkstations(actor)) throw new Error("Forbidden");
    const sql = await getSql();
    const [titles, assets, assetVersions, qc, legal, rights, packages, publications, audit, gateCertifications, productionAssets, titleEvents] = await Promise.all([
      sql`select id, name, name_ml, original_title, owner_user_id, owner_account_type, status, language, original_language,
          year, runtime_minutes, country_of_origin, release_date, content_type, master_key, poster_key, synopsis,
          credits, updated_at from bridge_titles order by updated_at desc limit 200`,
      sql`select id, title_id, kind, s3_key, content_type, byte_size, created_at from bridge_assets order by created_at desc limit 1000`,
      sql`select id, title_id, asset_group, asset_type, version, language, codec, s3_key, processing_state, created_at from bridge_asset_versions order by created_at desc limit 1000`,
      sql`select id, title_id, asset_version_id, status, automated_findings, reviewer_findings, reviewed_by, reviewed_at, created_at from bridge_qc_cases order by created_at desc limit 500`,
      sql`select id, title_id, status, classification, evidence, restrictions, reviewed_by, reviewed_at, created_at from bridge_legal_cases order by created_at desc limit 500`,
      sql`select id, title_id, grant_type, territories, languages, media, window_start, window_end, exclusivity, evidence, status, created_by, created_at from bridge_rights_grants order by created_at desc limit 1000`,
      sql`select id, title_id, destination, package_version, rights_grant_id, qc_case_id, legal_case_id, readiness_state, authorized_by, authorized_at, created_at, commercial_model, distributor_exclusivity, revenue_share_percent from bridge_destination_packages order by created_at desc limit 500`,
      sql`select id, bridge_title_id, loop_title_id, authorization_status, territories, languages, exploitation_models, window_start, window_end, approved_by, approved_at, revoked_at, updated_at from bridge_loop_publications order by updated_at desc limit 500`,
      sql`select id, actor_user_id, action, entity_type, entity_id, metadata, created_at from bridge_audit_logs order by created_at desc limit 500`,
      sql`select title_id, ott_preparation_status, packaging_status, curation_status, delivery_status, evidence, updated_by, updated_at from bridge_title_gate_certifications`,
      sql`select id, title_id, category, file_name, file_size, content_type, tags, created_at from bridge_production_assets order by created_at desc limit 1000`,
      sql`select id, title_id, from_status, to_status, actor_user_id, note, created_at from bridge_title_events order by created_at desc limit 1000`,
    ]);
    return JSON.parse(JSON.stringify({ titles, assets, assetVersions, qc, legal, rights, packages, publications, audit, gateCertifications, productionAssets, titleEvents }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

const reviewInput = z.object({
  titleId: z.string().min(8),
  decision: z.enum(["ACCEPT", "PASS", "FAIL", "APPROVE", "REJECT"]),
  notes: z.string().trim().min(8).max(4000).optional(),
  grantId: z.string().uuid().optional(),
});

export const reviewAdminTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (!actor.internalRole) throw new Error("Forbidden");

    if (data.decision === "PASS" || data.decision === "APPROVE" || data.decision === "REJECT") {
      if (!data.notes) throw new Error("Add review findings/evidence notes before submitting a decision");
      const result = await (await getSql()).transaction((tx) =>
        reviewWorkflow(tx, actor, {
          titleId: data.titleId,
          stage: data.decision === "PASS" ? "QC" : "LEGAL",
          decision: data.decision === "REJECT" ? "REJECT" : "APPROVE",
          note: data.notes!,
          ...(data.grantId ? { grantId: data.grantId } : {}),
        }),
      );
      return { ok: true, ...result };
    }

    const sql = await getSql();
    const rows = await sql<{ id: string; status: string }>`select id,status from bridge_titles where id=${data.titleId} limit 1`;
    const title = rows[0];
    if (!title) throw new Error("Title not found");
    if (data.decision === "ACCEPT") {
      assertPermission(actor, "title.advance_upload");
      if (title.status !== "PREPARING") throw new Error("Submission is not awaiting acceptance");
      return await sql.transaction(async (tx) => {
        await tx`update bridge_titles set status='QC_REVIEW',updated_at=now() where id=${title.id}`;
        await tx`insert into bridge_title_events(title_id,from_status,to_status,actor_user_id,note)
          values (${title.id},'PREPARING','QC_REVIEW',${actor.userId},${data.notes ?? null})`;
        await writeAudit({actorUserId:actor.userId,action:"submission.accept",entityType:"bridge_title",entityId:title.id,metadata:{notes:data.notes??null}},tx);
        return {ok:true,status:"QC_REVIEW"};
      });
    }

    assertPermission(actor, "title.qc_review");
    if (title.status !== "QC_REVIEW") throw new Error("Title is not in QC review");
    const note = data.notes ?? "QC failed; remediation required";
    return await sql.transaction(async (tx) => {
      await tx`insert into bridge_qc_cases(title_id,status,reviewer_findings,reviewed_by,reviewed_at)
        values (${title.id},'ACTION_REQUIRED',${JSON.stringify([{note}])}::jsonb,${actor.userId},now())`;
      await writeAudit({actorUserId:actor.userId,action:"qc.fail",entityType:"bridge_title",entityId:title.id,metadata:{notes:note}},tx);
      return {ok:true,status:"QC_REVIEW"};
    });
  });

const gateInput = z.object({
  titleId: z.string().min(1),
  gate: z.enum(["OTT","PACKAGING","CURATION","DELIVERY"]),
  decision: z.enum(["PASS","HOLD","FAIL","REVOKE"]),
  notes: z.string().max(4000).optional(),
});

export const setBuyerPublicationGate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(gateInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (!actor.internalRole) throw new Error("Forbidden");
    assertPermission(actor, "title.approve");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`select id from bridge_titles where id = ${data.titleId} limit 1`;
    if (!rows[0]) throw new Error("Title not found");

    const value = data.decision === "PASS"
      ? ({OTT:"READY",PACKAGING:"COMPLETE",CURATION:"APPROVED",DELIVERY:"READY"} as const)[data.gate]
      : data.decision === "REVOKE" && data.gate === "DELIVERY" ? "REVOKED"
      : "HOLD";

    await sql`
      insert into bridge_title_gate_certifications (title_id, ott_preparation_status, packaging_status, curation_status, delivery_status, updated_by, evidence, updated_at)
      values (${data.titleId}, 'HOLD', 'HOLD', 'HOLD', 'HOLD', ${actor.userId}, ${JSON.stringify({[data.gate]:{decision:data.decision,notes:data.notes??null,actor:actor.userId,at:new Date().toISOString()}})}::jsonb, now())
      on conflict (title_id) do nothing
    `;
    const gateEvidence = JSON.stringify({
      [data.gate]: {
        decision: data.decision,
        notes: data.notes ?? null,
        actor: actor.userId,
        at: new Date().toISOString(),
      },
    });
    if (data.gate === "OTT") {
      await sql`update bridge_title_gate_certifications
        set ott_preparation_status=${value}, updated_by=${actor.userId},
            evidence=evidence || ${gateEvidence}::jsonb, updated_at=now()
        where title_id=${data.titleId}`;
    } else if (data.gate === "PACKAGING") {
      await sql`update bridge_title_gate_certifications
        set packaging_status=${value}, updated_by=${actor.userId},
            evidence=evidence || ${gateEvidence}::jsonb, updated_at=now()
        where title_id=${data.titleId}`;
    } else if (data.gate === "CURATION") {
      await sql`update bridge_title_gate_certifications
        set curation_status=${value}, updated_by=${actor.userId},
            evidence=evidence || ${gateEvidence}::jsonb, updated_at=now()
        where title_id=${data.titleId}`;
    } else {
      await sql`update bridge_title_gate_certifications
        set delivery_status=${value}, updated_by=${actor.userId},
            evidence=evidence || ${gateEvidence}::jsonb, updated_at=now()
        where title_id=${data.titleId}`;
    }
    await writeAudit({actorUserId:actor.userId,action:`buyer_gate.${data.gate.toLowerCase()}.${data.decision.toLowerCase()}`,entityType:"bridge_title",entityId:data.titleId,metadata:{gate:data.gate,decision:data.decision,notes:data.notes??null}});
    const result=await sql<{ok:boolean}>`select public.bridge_title_buyer_visibility(${data.titleId}) as ok`;
    return {ok:true,gate:data.gate,decision:data.decision,publishable:result[0]?.ok===true};
  });
