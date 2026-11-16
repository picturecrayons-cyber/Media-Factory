import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission, canAccessAdminWorkstations } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

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
    const [titles, assets, assetVersions, qc, legal, rights, packages, publications, gateCertifications, audit] = await Promise.all([
      sql`select id, name, owner_user_id, owner_account_type, status, language, updated_at from bridge_titles order by updated_at desc limit 200`,
      sql`select id, title_id, kind, s3_key, content_type, byte_size, created_at from bridge_assets order by created_at desc limit 300`,
      sql`select id, title_id, asset_group, asset_type, version, language, codec, s3_key, processing_state, created_at from bridge_asset_versions order by created_at desc limit 300`,
      sql`select id, title_id, asset_version_id, status, automated_findings, reviewer_findings, reviewed_by, reviewed_at, created_at from bridge_qc_cases order by created_at desc limit 200`,
      sql`select id, title_id, status, classification, evidence, restrictions, reviewed_by, reviewed_at, created_at from bridge_legal_cases order by created_at desc limit 200`,
      sql`select id, title_id, grant_type, territories, languages, media, window_start, window_end, exclusivity, holdbacks, sublicensing_allowed, promotional_rights, restrictions, evidence, status, created_by, created_at from bridge_rights_grants order by created_at desc limit 300`,
      sql`select id, title_id, destination, package_version, rights_grant_id, qc_case_id, legal_case_id, readiness_state, authorized_by, authorized_at, created_at, commercial_model, distributor_exclusivity, revenue_share_percent from bridge_destination_packages order by created_at desc limit 200`,
      sql`select id, bridge_title_id, loop_title_id, authorization_status, territories, languages, exploitation_models, window_start, window_end, approved_by, approved_at, revoked_at, updated_at from bridge_loop_publications order by updated_at desc limit 200`,
      sql`select title_id, ott_preparation_status, packaging_status, curation_status, delivery_status, evidence, updated_by, updated_at from bridge_title_gate_certifications order by updated_at desc limit 300`,
      sql`select id, actor_user_id, action, entity_type, entity_id, metadata, created_at from bridge_audit_logs order by created_at desc limit 200`,
    ]);
    return JSON.parse(JSON.stringify({ titles, assets, assetVersions, qc, legal, rights, packages, publications, gateCertifications, audit }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

const reviewInput = z.object({
  titleId: z.string().min(1),
  decision: z.enum(["ACCEPT", "PASS", "FAIL", "APPROVE", "REJECT"]),
  notes: z.string().max(4000).optional(),
});

export const reviewAdminTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (!actor.internalRole) throw new Error("Forbidden");
    if (data.decision === "APPROVE" || data.decision === "REJECT") {
      throw new Error("Rights decisions must use the grant-level evidence checklist in Admin → Workstations → Rights");
    }
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string }>`select id, status from bridge_titles where id = ${data.titleId} limit 1`;
    const title = rows[0];
    if (!title) throw new Error("Title not found");
    let next: string | null = null;
    let action = "admin.review";
    if (data.decision === "ACCEPT") {
      assertPermission(actor, "title.advance_upload");
      if (title.status !== "PREPARING") throw new Error("Submission is not awaiting acceptance");
      next = "QC_REVIEW"; action = "submission.accept";
    } else if (data.decision === "PASS") {
      assertPermission(actor, "title.qc_review");
      if (title.status !== "QC_REVIEW") throw new Error("Title is not in QC review");
      next = "RIGHTS_REVIEW"; action = "qc.pass";
    } else if (data.decision === "FAIL") {
      assertPermission(actor, "title.qc_review");
      if (title.status !== "QC_REVIEW") throw new Error("Title is not in QC review");
      await sql`insert into bridge_qc_cases (title_id, status, reviewer_findings, reviewed_by, reviewed_at) values (${title.id}, 'FAILED', ${JSON.stringify(data.notes ? [{ note: data.notes }] : [])}::jsonb, ${actor.userId}, now())`;
      await writeAudit({ actorUserId: actor.userId, action: "qc.fail", entityType: "bridge_title", entityId: title.id, metadata: { notes: data.notes ?? null } });
      return { ok: true, status: "QC_REVIEW" };
    } else if (data.decision === "APPROVE") {
      assertPermission(actor, "title.rights_review");
      if (title.status !== "RIGHTS_REVIEW") throw new Error("Title is not in rights review");
      next = "LICENSING_READY"; action = "rights.approve";
    } else {
      assertPermission(actor, "title.rights_review");
      if (title.status !== "RIGHTS_REVIEW") throw new Error("Title is not in rights review");
      await sql`insert into bridge_legal_cases (title_id, status, evidence, reviewed_by, reviewed_at) values (${title.id}, 'REJECTED', ${JSON.stringify(data.notes ? [{ note: data.notes }] : [])}::jsonb, ${actor.userId}, now())`;
      await writeAudit({ actorUserId: actor.userId, action: "rights.reject", entityType: "bridge_title", entityId: title.id, metadata: { notes: data.notes ?? null } });
      return { ok: true, status: "RIGHTS_REVIEW" };
    }
    await sql`update bridge_titles set status = ${next}, updated_at = now() where id = ${title.id}`;
    await sql`insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note) values (${title.id}, ${title.status}, ${next}, ${actor.userId}, ${data.notes ?? null})`;
    if (data.decision === "PASS") await sql`insert into bridge_qc_cases (title_id, status, reviewer_findings, reviewed_by, reviewed_at) values (${title.id}, 'PASSED', ${JSON.stringify(data.notes ? [{ note: data.notes }] : [])}::jsonb, ${actor.userId}, now())`;
    if (data.decision === "APPROVE") await sql`insert into bridge_legal_cases (title_id, status, evidence, reviewed_by, reviewed_at) values (${title.id}, 'APPROVED', ${JSON.stringify(data.notes ? [{ note: data.notes }] : [])}::jsonb, ${actor.userId}, now())`;
    await writeAudit({ actorUserId: actor.userId, action, entityType: "bridge_title", entityId: title.id, metadata: { from: title.status, to: next, notes: data.notes ?? null } });
    return { ok: true, status: next };
  });

const gateInput = z.object({
  titleId: z.string().min(1),
  gate: z.enum(["OTT","PACKAGING","CURATION","DELIVERY"]),
  decision: z.enum(["PASS","HOLD","FAIL","REVOKE"]),
  notes: z.string().max(4000).optional(),
}).superRefine((value, ctx) => {
  if (["HOLD", "FAIL", "REVOKE"].includes(value.decision) && (value.notes?.trim().length ?? 0) < 8) {
    ctx.addIssue({ code: "custom", path: ["notes"], message: "A reason of at least 8 characters is required" });
  }
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


const releaseControlInput = z.object({
  titleId: z.string().min(8),
  decision: z.enum(["HOLD", "BLOCK", "RELEASE"]),
  reason: z.string().trim().min(8).max(4000),
});

export const setTitleReleaseControl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(releaseControlInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (!actor.internalRole) throw new Error("Forbidden");
    assertPermission(actor, "title.approve");
    const sql = await getSql();
    const control = {
      status: data.decision === "RELEASE" ? "CLEAR" : data.decision,
      reason: data.reason,
      actor: actor.userId,
      at: new Date().toISOString(),
    };
    await sql.transaction(async (tx) => {
      await tx`
        insert into bridge_title_gate_certifications
          (title_id, ott_preparation_status, packaging_status, curation_status, delivery_status, updated_by, evidence, updated_at)
        values
          (${data.titleId}, 'HOLD', 'HOLD', 'HOLD', 'HOLD', ${actor.userId},
           jsonb_build_object('releaseControl', ${JSON.stringify(control)}::jsonb), now())
        on conflict (title_id) do update
          set evidence = coalesce(bridge_title_gate_certifications.evidence, '{}'::jsonb)
                || jsonb_build_object('releaseControl', ${JSON.stringify(control)}::jsonb),
              updated_by = excluded.updated_by,
              updated_at = now()
      `;
      const rows = await tx<{ evidence: Record<string, unknown> }>`
        select evidence from bridge_title_gate_certifications where title_id = ${data.titleId} limit 1
      `;
      const stored = rows[0]?.evidence?.releaseControl as { status?: string; actor?: string; reason?: string } | undefined;
      if (!stored || stored.status !== control.status || stored.actor !== actor.userId || stored.reason !== data.reason) {
        throw new Error("Release control read-back verification failed");
      }
      await tx`
        insert into bridge_audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        values (
          ${actor.userId},
          ${data.decision === "RELEASE" ? "title.release_control.clear" : "title.release_control." + data.decision.toLowerCase()},
          'bridge_title',
          ${data.titleId},
          ${JSON.stringify({ ...control, decision: data.decision })}::jsonb
        )
      `;
    });
    return { ok: true, status: control.status, actor: actor.userId, verified: true };
  });


const publishTitleInput = z.object({ titleId: z.string().min(8) });

export const publishTitleToBuyers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(publishTitleInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (!actor.internalRole) throw new Error("Forbidden");
    assertPermission(actor, "title.approve");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [title] = await tx<{ id: string; status: string }>`
        select id, status from bridge_titles where id = ${data.titleId} for update
      `;
      if (!title) throw new Error("Title not found");
      if (title.status !== "LICENSING_READY") throw new Error("Title must be LICENSING_READY before buyer publication");
      const checks = await tx<{
        qc_ok: boolean;
        legal_ok: boolean;
        rights_ok: boolean;
        gates_ok: boolean;
        package_ok: boolean;
        release_clear: boolean;
      }>`
        select
          exists(select 1 from bridge_qc_cases q where q.title_id=t.id and q.status='PASSED') as qc_ok,
          exists(
            select 1 from bridge_legal_cases l
            join bridge_rights_grants rg on rg.title_id=l.title_id
            where l.title_id=t.id and l.status='APPROVED'
              and rg.status='VALID'
              and rg.window_start is not null and rg.window_start <= now()
              and rg.window_end is not null and rg.window_end > now()
              and exists (
                select 1 from jsonb_array_elements(l.evidence) le
                where le->>'grantId'=rg.id::text
              )
          ) as legal_ok,
          exists(
            select 1 from bridge_rights_grants rg
            where rg.title_id=t.id and rg.status='VALID'
              and rg.window_start is not null and rg.window_start <= now()
              and rg.window_end is not null and rg.window_end > now()
              and jsonb_array_length(rg.territories)>0
              and jsonb_array_length(rg.languages)>0
              and jsonb_array_length(rg.media)>0
          ) as rights_ok,
          exists(
            select 1 from bridge_title_gate_certifications g
            where g.title_id=t.id
              and g.ott_preparation_status='READY'
              and g.packaging_status='COMPLETE'
              and g.curation_status='APPROVED'
              and g.delivery_status='READY'
              and coalesce(g.evidence->'releaseControl'->>'status','CLEAR')='CLEAR'
          ) as gates_ok,
          exists(
            select 1 from bridge_destination_packages p
            join bridge_rights_grants rg on rg.id=p.rights_grant_id
            where p.title_id=t.id
              and p.readiness_state in ('READY','AUTHORIZED','DELIVERED')
              and rg.status='VALID'
          ) as package_ok,
          not exists(
            select 1 from bridge_title_gate_certifications g
            where g.title_id=t.id
              and coalesce(g.evidence->'releaseControl'->>'status','CLEAR') in ('HOLD','BLOCK')
          ) as release_clear
        from bridge_titles t where t.id=${data.titleId}
      `;
      const c = checks[0];
      if (!c || !c.qc_ok || !c.legal_ok || !c.rights_ok || !c.gates_ok || !c.package_ok || !c.release_clear) {
        const missing = [
          ["QC pass", c?.qc_ok],
          ["approved legal case linked to a valid rights grant", c?.legal_ok],
          ["active and complete rights grant", c?.rights_ok],
          ["all four publication gates and no HOLD/BLOCK", c?.gates_ok],
          ["ready destination package linked to valid rights", c?.package_ok],
          ["release control clear", c?.release_clear],
        ].filter(([, ok]) => !ok).map(([name]) => name);
        throw new Error("Buyer publication blocked: " + missing.join(", "));
      }
      await tx`update bridge_titles set status='LIVE_FOR_BUYERS', updated_at=now() where id=${data.titleId}`;
      await tx`insert into bridge_title_events(title_id,from_status,to_status,actor_user_id,note)
        values (${data.titleId},'LICENSING_READY','LIVE_FOR_BUYERS',${actor.userId},'Super Admin buyer publication after verified gates')`;
      await tx`insert into bridge_audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
        values (${actor.userId},'title.publish_to_buyers','bridge_title',${data.titleId},
          ${JSON.stringify({ status: 'LIVE_FOR_BUYERS', verifiedBy: actor.userId })}::jsonb)`;
      const [readback] = await tx<{ status: string }>`select status from bridge_titles where id=${data.titleId}`;
      const [visibility] = await tx<{ visible: boolean }>`select public.bridge_title_buyer_visibility(${data.titleId}) as visible`;
      if (readback?.status !== "LIVE_FOR_BUYERS" || visibility?.visible !== true) {
        throw new Error("Buyer publication read-back failed; transaction rolled back");
      }
      return { ok: true, status: readback.status, buyerVisible: visibility.visible, verified: true };
    });
  });
