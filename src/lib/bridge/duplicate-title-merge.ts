import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";
import {
  evaluateDuplicateTitleMerge,
  type MergeDecision,
  type MergeTitle,
  type MergeRights,
  type MergeEvaluationInput,
} from "./duplicate-policy";

export type { MergeDecision, MergeTitle, MergeRights, MergeEvaluationInput };
export { evaluateDuplicateTitleMerge };

async function loadMergeState(sql: any, titleId: string) {
  const [
    title,
    rights,
    buyers,
    assets,
    baseAssets,
    deliveries,
    publications,
    qcCases,
    legalCases,
    events,
  ] = await Promise.all([
    sql<MergeTitle>`select id,name,slug,language,status,owner_user_id,year,runtime_minutes,original_language,poster_key,master_key from public.bridge_titles where id=${titleId} limit 1`,
    sql<MergeRights>`select id,territories,languages,window_start,window_end,exclusivity,status from public.bridge_rights_grants where title_id=${titleId} order by created_at`,
    sql`select * from public.bridge_buyer_title_access where title_id=${titleId} order by buyer_user_id`,
    sql`select id,asset_group,asset_type,version,language,codec,s3_key,checksum_sha256,processing_state from public.bridge_asset_versions where title_id=${titleId} order by asset_group,asset_type,version,language`,
    sql`select id,kind,s3_key,content_type,byte_size,checksum_sha256,verified from public.bridge_assets where title_id=${titleId} order by kind`,
    sql`select id,destination,package_version,rights_grant_id,qc_case_id,asset_version_ids,readiness_state,authorized_at from public.bridge_destination_packages where title_id=${titleId} order by destination,package_version`,
    sql`select id,bridge_title_id,loop_title_id,authorization_status,territories,languages,exploitation_models,window_start,window_end,approved_at,revoked_at from public.bridge_loop_publications where bridge_title_id=${titleId}`,
    sql`select id,status,reviewer_findings,reviewed_by,reviewed_at from public.bridge_qc_cases where title_id=${titleId} order by created_at desc`,
    sql`select id,status,evidence,reviewed_by,reviewed_at from public.bridge_legal_cases where title_id=${titleId} order by created_at desc`,
    sql`select id,from_status,to_status,actor_user_id,note,created_at from public.bridge_title_events where title_id=${titleId} order by created_at asc`,
  ]);
  return {
    title: title[0] ?? null,
    rights,
    buyers,
    assets: baseAssets,
    assetVersions: assets,
    deliveries,
    publications,
    qcCases,
    legalCases,
    events,
  };
}

export const previewDuplicateTitleMerge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ canonicalTitleId: z.string().min(8), retiringTitleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.read_catalog");
    if (data.canonicalTitleId === data.retiringTitleId) throw new Error("A title cannot merge into itself.");
    const sql = await getSql();
    const canonical = await loadMergeState(sql, data.canonicalTitleId);
    const retiring = await loadMergeState(sql, data.retiringTitleId);
    if (!canonical.title || !retiring.title) throw new Error("Both title records must exist.");
    const result = evaluateDuplicateTitleMerge({
      identityCertain: true,
      canonical: canonical.title,
      retiring: retiring.title,
      canonicalRights: canonical.rights,
      retiringRights: retiring.rights,
      canonicalBuyers: canonical.buyers,
      retiringBuyers: retiring.buyers,
      canonicalAssets: canonical.assets,
      retiringAssets: retiring.assets,
      canonicalDeliveries: canonical.deliveries,
      retiringDeliveries: retiring.deliveries,
      canonicalLoopPublications: canonical.publications,
      retiringLoopPublications: retiring.publications,
    });
    return {
      canonicalTitleId: data.canonicalTitleId,
      retiringTitleId: data.retiringTitleId,
      decision: result.decision,
      reasons: result.reasons,
      collisions: result.collisions,
      preview: { canonical, retiring },
    };
  });

export const mergeDuplicateTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      canonicalTitleId: z.string().min(8),
      retiringTitleId: z.string().min(8),
      expectedDecision: z.literal("SAFE"),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    // Requires super_admin or staff with title.merge_duplicate permission
    assertPermission(actor, "title.merge_duplicate");
    if (data.canonicalTitleId === data.retiringTitleId) throw new Error("A title cannot merge into itself.");

    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const canonical = await loadMergeState(tx, data.canonicalTitleId);
      const retiring = await loadMergeState(tx, data.retiringTitleId);
      if (!canonical.title || !retiring.title) throw new Error("Both title records must exist.");

      const decision = evaluateDuplicateTitleMerge({
        identityCertain: true,
        canonical: canonical.title,
        retiring: retiring.title,
        canonicalRights: canonical.rights,
        retiringRights: retiring.rights,
        canonicalBuyers: canonical.buyers,
        retiringBuyers: retiring.buyers,
        canonicalAssets: canonical.assets,
        retiringAssets: retiring.assets,
        canonicalDeliveries: canonical.deliveries,
        retiringDeliveries: retiring.deliveries,
        canonicalLoopPublications: canonical.publications,
        retiringLoopPublications: retiring.publications,
      });

      if (decision.decision !== data.expectedDecision) {
        throw new Error(`MERGE_DECISION_CHANGED: ${decision.decision}`);
      }
      if (decision.decision !== "SAFE") {
        throw new Error(`DUPLICATE_MERGE_${decision.decision}: ${decision.reasons.join(",")}`);
      }

      if (canonical.publications.length || retiring.publications.length) {
        throw new Error("LOOP_PUBLICATION_CONFLICT: merge is blocked while a Loop publication exists.");
      }

      const mergeId = randomUUID();
      const pre = { canonical, retiring, decision };
      await tx`
        insert into public.bridge_title_merge_audits
          (merge_id,canonical_title_id,retiring_title_id,decision,actor_user_id,reason,collision_scan,pre_merge_state)
        values
          (${mergeId},${data.canonicalTitleId},${data.retiringTitleId},'MERGED',${actor.userId},'production-safe duplicate merge',
           ${JSON.stringify(decision)}::jsonb,${JSON.stringify(pre)}::jsonb)
      `;

      const refTables = [
        "bridge_assets",
        "bridge_asset_versions",
        "bridge_qc_cases",
        "bridge_legal_cases",
        "bridge_rights_grants",
        "bridge_destination_packages",
        "bridge_buyer_title_access",
        "bridge_title_events",
        "bridge_payments",
        "bridge_service_orders",
        "bridge_service_quotes",
      ];

      for (const table of refTables) {
        try {
          await tx.query(`update public.${table} set title_id=$1 where title_id=$2`, [
            data.canonicalTitleId,
            data.retiringTitleId,
          ]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`MERGE_REFERENCE_REPOINT_FAILED:${table}:${message}`);
        }
      }

      await tx`
        insert into public.bridge_title_merge_aliases(retiring_title_id,canonical_title_id,merge_id)
        values (${data.retiringTitleId},${data.canonicalTitleId},${mergeId})
        on conflict (retiring_title_id) do nothing
      `;

      await tx`
        update public.bridge_titles
        set status='DRAFT', merged_into_title_id=${data.canonicalTitleId}, merged_at=now(), updated_at=now()
        where id=${data.retiringTitleId}
      `;

      const post = await loadMergeState(tx, data.canonicalTitleId);
      await tx`
        update public.bridge_title_merge_audits
        set post_merge_state=${JSON.stringify(post)}::jsonb, completed_at=now()
        where merge_id=${mergeId}
      `;

      await writeAudit({
        actorUserId: actor.userId,
        action: "duplicate_title.merge",
        entityType: "bridge_title",
        entityId: data.canonicalTitleId,
        metadata: { mergeId, retiringTitleId: data.retiringTitleId, decision },
      });

      return { ok: true, mergeId, canonicalTitleId: data.canonicalTitleId };
    });
  });

export const rollbackDuplicateTitleMerge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ mergeId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.merge_duplicate");
    const sql = await getSql();

    return sql.transaction(async (tx) => {
      const rows = await tx.query<{
        merge_id: string;
        canonical_title_id: string;
        retiring_title_id: string;
        decision: string;
        pre_merge_state: { retiring?: { title?: { id?: string } } };
      }>(
        "select merge_id,canonical_title_id,retiring_title_id,decision,pre_merge_state from public.bridge_title_merge_audits where merge_id=$1 for update",
        [data.mergeId],
      );
      const audit = rows[0];
      if (!audit || audit.decision !== "MERGED") throw new Error("MERGE_ROLLBACK_UNAVAILABLE");

      const retiring = audit.pre_merge_state?.retiring;
      if (!retiring?.title?.id) throw new Error("MERGE_ROLLBACK_SNAPSHOT_INVALID");

      const restoreIds = (rows: unknown[]) =>
        rows
          .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>).id : null))
          .filter((id): id is string => typeof id === "string" && id.length > 0);

      const state = audit.pre_merge_state as Record<string, unknown>;
      const retiringState = (state.retiring ?? {}) as Record<string, unknown>;
      const tableKeys: Array<[string, string]> = [
        ["bridge_assets", "assets"],
        ["bridge_asset_versions", "assetVersions"],
        ["bridge_qc_cases", "qcCases"],
        ["bridge_legal_cases", "legalCases"],
        ["bridge_rights_grants", "rights"],
        ["bridge_destination_packages", "deliveries"],
        ["bridge_buyer_title_access", "buyers"],
        ["bridge_title_events", "events"],
        ["bridge_payments", "payments"],
        ["bridge_service_orders", "serviceOrders"],
        ["bridge_service_quotes", "serviceQuotes"],
      ];

      for (const [table, key] of tableKeys) {
        const ids = restoreIds(
          Array.isArray(retiringState[key]) ? (retiringState[key] as unknown[]) : [],
        );
        for (const id of ids) {
          await tx.query(`update public.${table} set title_id=$1 where id=$2`, [
            audit.retiring_title_id,
            id,
          ]);
        }
      }

      await tx.query(
        "update public.bridge_titles set merged_into_title_id=null, merged_at=null, updated_at=now() where id=$1",
        [audit.retiring_title_id],
      );

      await tx.query(
        "delete from public.bridge_title_merge_aliases where retiring_title_id=$1",
        [audit.retiring_title_id],
      );

      await tx.query(
        "update public.bridge_title_merge_audits set decision='ROLLED_BACK', rollback_state=$1::jsonb, completed_at=now() where merge_id=$2",
        [
          JSON.stringify({ restoredTitleId: audit.retiring_title_id, actorUserId: actor.userId }),
          data.mergeId,
        ],
      );

      await writeAudit({
        actorUserId: actor.userId,
        action: "duplicate_title.rollback",
        entityType: "bridge_title",
        entityId: audit.canonical_title_id,
        metadata: { mergeId: data.mergeId, retiringTitleId: audit.retiring_title_id },
      });

      return { ok: true, mergeId: data.mergeId, restoredTitleId: audit.retiring_title_id };
    });
  });
