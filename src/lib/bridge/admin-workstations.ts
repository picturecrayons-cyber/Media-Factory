import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission, canAccessAdminWorkstations } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { listIncomingSubmissions } from "./submission-queue";
import { assertNotDevUser } from "./guards";
import { hasVerifiedMasterAndArtwork } from "./asset-roles";
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
    const [titles, assets, assetVersions, qc, legal, rights, packages, publications, audit, submissions] = await Promise.all([
      sql`select t.id, t.name, t.owner_user_id, t.owner_account_type, t.owner_organization_id,
        p.display_name as owner_display_name, p.email as owner_email,
        coalesce(o.legal_name, p.organization_name) as owner_organization_name,
        t.status, t.language, t.updated_at
        from bridge_titles t
        left join bridge_profiles p on p.user_id = t.owner_user_id
        left join bridge_organizations o on o.id = t.owner_organization_id
        where t.submission_type is distinct from 'story_concept'
        order by t.updated_at desc limit 200`,
      sql`select id, title_id, kind, s3_key, content_type, byte_size, created_at from bridge_assets order by created_at desc limit 300`,
      sql`select id, title_id, asset_group, asset_type, version, language, codec, s3_key, processing_state, created_at from bridge_asset_versions order by created_at desc limit 300`,
      sql`select id, title_id, asset_version_id, status, automated_findings, reviewer_findings, reviewed_by, reviewed_at, created_at from bridge_qc_cases order by created_at desc limit 200`,
      sql`select id, title_id, status, classification, evidence, restrictions, reviewed_by, reviewed_at, created_at from bridge_legal_cases order by created_at desc limit 200`,
      sql`select id, title_id, grant_type, territories, languages, media, window_start, window_end, exclusivity, status, created_by, created_at from bridge_rights_grants order by created_at desc limit 200`,
      sql`select id, title_id, destination, package_version, rights_grant_id, qc_case_id, legal_case_id, readiness_state, authorized_by, authorized_at, created_at, commercial_model, distributor_exclusivity, revenue_share_percent from bridge_destination_packages order by created_at desc limit 200`,
      sql`select id, bridge_title_id, loop_title_id, authorization_status, territories, languages, exploitation_models, window_start, window_end, approved_by, approved_at, revoked_at, updated_at from bridge_loop_publications order by updated_at desc limit 200`,
      sql`select id, actor_user_id, action, entity_type, entity_id, metadata, created_at from bridge_audit_logs order by created_at desc limit 200`,
      listIncomingSubmissions(sql),
    ]);
    return JSON.parse(JSON.stringify({ titles, assets, assetVersions, qc, legal, rights, packages, publications, audit, submissions }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

const reviewInput = z.object({
  titleId: z.string().min(1),
  decision: z.enum(["ACCEPT", "PASS", "FAIL", "APPROVE", "REJECT"]),
  notes: z.string().trim().min(8).max(2000).optional(),
  grantId: z.string().uuid().optional(),
});

export const reviewAdminTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (!actor.internalRole) throw new Error("Forbidden");
    const sql = await getSql();

    return sql.transaction(async (tx) => {
      if (data.decision === "ACCEPT") {
        assertPermission(actor, "title.advance_upload");
        const rows = await tx<{ id: string; status: string; master_key: string | null; poster_key: string | null }>\`
          select id, status, master_key, poster_key
          from bridge_titles where id = \${data.titleId} for update
        \`;
        const title = rows[0];
        if (!title) throw new Error("Title not found");
        if (title.status !== "PREPARING") throw new Error("Submission is not awaiting acceptance");
        const assets = await tx<{ kind: string; s3_key: string }>\`
          select kind, s3_key from bridge_assets
          where title_id = \${title.id} and coalesce(byte_size, 0) > 0
        \`;
        if (!hasVerifiedMasterAndArtwork(assets, title.master_key, title.poster_key)) {
          throw new Error("Verified current master and artwork are required before QC");
        }
        await tx\`update bridge_titles set status = 'QC_REVIEW', updated_at = now() where id = \${title.id}\`;
        await tx\`insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
          values (\${title.id}, \${title.status}, 'QC_REVIEW', \${actor.userId}, \${data.notes ?? "Accepted for QC review"})\`;
        await writeAudit({
          actorUserId: actor.userId,
          action: "submission.accept",
          entityType: "bridge_title",
          entityId: title.id,
          metadata: { from: title.status, to: "QC_REVIEW", notes: data.notes ?? null },
        }, tx);
        return { ok: true, status: "QC_REVIEW" };
      }

      const stage = data.decision === "PASS" || data.decision === "FAIL" ? "QC" : "LEGAL";
      const decision = data.decision === "PASS" || data.decision === "APPROVE" ? "APPROVE" : "REJECT";
      if (!data.notes) throw new Error("A review note of at least 8 characters is required");
      if (stage === "LEGAL" && !data.grantId) throw new Error("Select a draft rights agreement before legal review");
      const result = await reviewWorkflow(tx, actor, {
        titleId: data.titleId,
        stage,
        decision,
        note: data.notes,
        ...(data.grantId ? { grantId: data.grantId } : {}),
      });
      return { ok: true, status: result.status };
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
    assertPermission(actor, "title.license");
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
