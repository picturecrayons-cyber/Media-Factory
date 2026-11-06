import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { assertVerifiedTitleIngestReady } from "./qc-readiness";
import { verifyBucketAccess, verifyObject } from "./oci-object-storage.server";

async function actorFor(userId: string) {
  assertNotDevUser(userId);
  return requireVerifiedActor(userId);
}

export const listAdminWorkstations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    if (!actor.internalRole) throw new Error("Forbidden");
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();
    const storageAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
    const assetsQuery = storageAdmin
      ? sql`select id, title_id, kind, s3_key, content_type, byte_size, storage_provider, storage_bucket, storage_namespace, storage_region, storage_endpoint, checksum_sha256, verified_object_key, object_version_id, object_generation, storage_verified_at, created_at from bridge_assets order by created_at desc limit 300`
      : sql`select id, title_id, kind, content_type, byte_size, created_at from bridge_assets order by created_at desc limit 300`;
    const assetVersionsQuery = storageAdmin
      ? sql`select id, title_id, asset_group, asset_type, version, language, codec, s3_key, processing_state, created_at from bridge_asset_versions order by created_at desc limit 300`
      : sql`select id, title_id, asset_group, asset_type, version, language, codec, processing_state, created_at from bridge_asset_versions order by created_at desc limit 300`;
    const [titles, assets, assetVersions, qc, legal, rights, packages, publications, profiles, audit] = await Promise.all([
      sql`select id, name, owner_user_id, owner_account_type, status, language, updated_at from bridge_titles order by updated_at desc limit 200`,
      assetsQuery,
      assetVersionsQuery,
      sql`select id, title_id, asset_version_id, status, automated_findings, reviewer_findings, reviewed_by, reviewed_at, created_at from bridge_qc_cases order by created_at desc limit 200`,
      sql`select id, title_id, status, classification, evidence, restrictions, reviewed_by, reviewed_at, created_at from bridge_legal_cases order by created_at desc limit 200`,
      sql`select id, title_id, grant_type, territories, languages, media, window_start, window_end, exclusivity, status, created_by, created_at from bridge_rights_grants order by created_at desc limit 200`,
      sql`select id, title_id, destination, package_version, rights_grant_id, qc_case_id, legal_case_id, readiness_state, authorized_by, authorized_at, created_at, commercial_model, distributor_exclusivity, revenue_share_percent from bridge_destination_packages order by created_at desc limit 200`,
      sql`select id, bridge_title_id, loop_title_id, authorization_status, territories, languages, exploitation_models, window_start, window_end, approved_by, approved_at, revoked_at, updated_at from bridge_loop_publications order by updated_at desc limit 200`,
      sql`select user_id, email, display_name, account_type, organization_name, internal_role, email_verified, created_at, updated_at from bridge_profiles order by updated_at desc limit 200`,
      sql`select id, actor_user_id, action, entity_type, entity_id, metadata, created_at from bridge_audit_logs order by created_at desc limit 200`,
    ]);
    return JSON.parse(JSON.stringify({ titles, assets, assetVersions, qc, legal, rights, packages, publications, profiles, audit }, (_, value) => typeof value === "bigint" ? value.toString() : value));
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
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string }>`select id, status from bridge_titles where id = ${data.titleId} limit 1`;
    const title = rows[0];
    if (!title) throw new Error("Title not found");
    let next: string | null = null;
    let action = "admin.review";
    if (data.decision === "ACCEPT") {
      assertPermission(actor, "title.advance_upload");
      if (title.status !== "PREPARING") throw new Error("Submission is not awaiting acceptance");
      await assertVerifiedTitleIngestReady(sql, title.id);
      next = "QC_REVIEW"; action = "submission.accept";
    } else if (data.decision === "PASS") {
      assertPermission(actor, "title.qc_review");
      if (title.status !== "QC_REVIEW") throw new Error("Title is not in QC review");
      await assertVerifiedTitleIngestReady(sql, title.id);
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

    if (data.decision === "PASS" && (data.gate === "PACKAGING" || data.gate === "DELIVERY")) {
      await assertVerifiedTitleIngestReady(sql, data.titleId);
    }
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

function assertStorageAdmin(actor: { internalRole: string | null }) {
  if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
    throw new Error("Admin or Super Admin access required");
  }
}

export const verifyOciBucketForAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    assertStorageAdmin(actor);
    const result = await verifyBucketAccess();
    await writeAudit({
      actorUserId: actor.userId,
      action: "storage.bucket_verified",
      entityType: "oci_bucket",
      entityId: result.bucket,
      metadata: { provider: result.provider, region: result.region, verifiedAt: result.verifiedAt },
    });
    return result;
  });

export const verifyOciAssetForAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    assertStorageAdmin(actor);
    const sql = await getSql();
    const rows = await sql<{
      id: string; title_id: string; kind: string; verified_object_key: string | null;
      byte_size: number | null; content_type: string | null; checksum_sha256: string | null;
    }>\`
      select id, title_id, kind, verified_object_key, byte_size, content_type, checksum_sha256
      from bridge_assets where id = \${data.assetId} limit 1
    \`;
    const asset = rows[0];
    if (!asset?.verified_object_key) throw new Error("Verified object reference is missing");
    const result = await verifyObject(asset.verified_object_key, asset.content_type);
    const matchesRecordedSize = Number(asset.byte_size) === result.byteSize;
    await writeAudit({
      actorUserId: actor.userId,
      action: "storage.object_verified",
      entityType: "bridge_asset",
      entityId: asset.id,
      metadata: { provider: "oci", matchesRecordedSize, observedByteSize: result.byteSize },
    });
    return { assetId: asset.id, matchesRecordedSize, observedByteSize: result.byteSize, contentType: result.contentType };
  });

/** Read-only dry-run inventory. No row or object is deleted by this endpoint. */
export const listTestDataCleanupCandidates = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    assertStorageAdmin(actor);
    const sql = await getSql();
    const rows = await sql<{
      id: string; name: string; status: string; updated_at: string | Date;
      asset_count: number; rights_count: number; legal_count: number;
      package_count: number; publication_count: number;
    }>\`
      select t.id, t.name, t.status, t.updated_at,
        (select count(*)::int from bridge_assets a where a.title_id=t.id) as asset_count,
        (select count(*)::int from bridge_rights_grants r where r.title_id=t.id) as rights_count,
        (select count(*)::int from bridge_legal_cases l where l.title_id=t.id) as legal_count,
        (select count(*)::int from bridge_destination_packages p where p.title_id=t.id) as package_count,
        (select count(*)::int from bridge_loop_publications p where p.bridge_title_id=t.id) as publication_count
      from bridge_titles t
      where lower(t.name) ~ '(^|[^a-z0-9])(test|demo|fixture|sample)([^a-z0-9]|$)'
      order by t.updated_at desc limit 100
    \`;
    await writeAudit({
      actorUserId: actor.userId,
      action: "test_data.cleanup_dry_run",
      entityType: "bridge_title",
      metadata: { candidateCount: rows.length, destructive: false },
    });
    return { candidates: rows, destructive: false };
  });
