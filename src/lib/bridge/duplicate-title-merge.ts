import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

export type MergeDecision = "SAFE" | "HOLD" | "BLOCK";

export type MergeTitle = {
  id: string;
  name: string;
  slug: string;
  language: string | null;
  status: string;
  owner_user_id: string | null;
  year: number | null;
  runtime_minutes: number | null;
  original_language?: string | null;
};

export type MergeRights = {
  id: string;
  territories: unknown;
  languages: unknown;
  window_start: string | Date | null;
  window_end: string | Date | null;
  exclusivity: string | null;
  status: string;
};

export type MergeEvaluationInput = {
  identityCertain: boolean;
  canonical: MergeTitle;
  retiring: MergeTitle;
  canonicalRights: MergeRights[];
  retiringRights: MergeRights[];
  canonicalBuyers: unknown[];
  retiringBuyers: unknown[];
  canonicalAssets: unknown[];
  retiringAssets: unknown[];
  canonicalDeliveries: unknown[];
  retiringDeliveries: unknown[];
  canonicalLoopPublications: unknown[];
  retiringLoopPublications: unknown[];
};

function setOf(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean),
  );
}

function equalSet(a: unknown, b: unknown) {
  const aa = setOf(a);
  const bb = setOf(b);
  if (!aa.size && !bb.size) return true;
  if (!aa.size || !bb.size) return false;
  return aa.size === bb.size && [...aa].every((v) => bb.has(v));
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalized(entry)]),
    );
  }
  return value;
}

function time(v: string | Date | null | undefined) {
  if (!v) return null;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}

function windowsConflict(a: MergeRights, b: MergeRights) {
  const aStart = time(a.window_start);
  const aEnd = time(a.window_end);
  const bStart = time(b.window_start);
  const bEnd = time(b.window_end);
  if (aStart === null && aEnd === null && bStart === null && bEnd === null) return false;
  const startA = aStart ?? Number.NEGATIVE_INFINITY;
  const endA = aEnd ?? Number.POSITIVE_INFINITY;
  const startB = bStart ?? Number.NEGATIVE_INFINITY;
  const endB = bEnd ?? Number.POSITIVE_INFINITY;
  return startA < endB && startB < endA;
}

function rightsConflict(a: MergeRights, b: MergeRights) {
  const languageConflict = !equalSet(a.languages, b.languages);
  const territoryConflict = !equalSet(a.territories, b.territories);
  const exclusivityConflict =
    Boolean(a.exclusivity && b.exclusivity) &&
    a.exclusivity.toUpperCase() !== b.exclusivity.toUpperCase();
  const windowConflict = windowsConflict(a, b);
  return { languageConflict, territoryConflict, exclusivityConflict, windowConflict };
}

function hasRightsCollision(a: MergeRights[], b: MergeRights[]) {
  const conflicts: Record<string, boolean> = {
    language: false,
    territory: false,
    window: false,
    exclusivity: false,
  };
  for (const left of a) {
    for (const right of b) {
      const c = rightsConflict(left, right);
      conflicts.language ||= c.languageConflict;
      conflicts.territory ||= c.territoryConflict;
      conflicts.window ||= c.windowConflict;
      conflicts.exclusivity ||= c.exclusivityConflict;
    }
  }
  return conflicts;
}

function stableJson(value: unknown) {
  return JSON.stringify(normalized(value));
}

function identicalReferenceSets(a: unknown[], b: unknown[]) {
  if (!a.length || !b.length) return true;
  return stableJson(a) === stableJson(b);
}

export function evaluateDuplicateTitleMerge(input: MergeEvaluationInput): {
  decision: MergeDecision;
  reasons: string[];
  collisions: Record<string, boolean>;
} {
  const reasons: string[] = [];
  if (!input.identityCertain) {
    return { decision: "BLOCK", reasons: ["TITLE_IDENTITY_UNCERTAIN"], collisions: {} };
  }

  const titleLanguageConflict =
    Boolean(input.canonical.language && input.retiring.language) &&
    input.canonical.language.trim().toUpperCase() !== input.retiring.language.trim().toUpperCase();

  const collisions = hasRightsCollision(input.canonicalRights, input.retiringRights);
  collisions.language ||= titleLanguageConflict;
  if (collisions.language) reasons.push("LANGUAGE_CONFLICT");
  if (collisions.territory) reasons.push("TERRITORY_CONFLICT");
  if (collisions.window) reasons.push("WINDOW_CONFLICT");
  if (collisions.exclusivity) reasons.push("EXCLUSIVITY_CONFLICT");

  if (!identicalReferenceSets(input.canonicalBuyers, input.retiringBuyers) && input.canonicalBuyers.length && input.retiringBuyers.length) {
    reasons.push("BUYER_MAPPING_CONFLICT");
  }
  if (!identicalReferenceSets(input.canonicalAssets, input.retiringAssets) && input.canonicalAssets.length && input.retiringAssets.length) {
    reasons.push("ASSET_VERSION_CONFLICT");
  }
  if (!identicalReferenceSets(input.canonicalDeliveries, input.retiringDeliveries) && input.canonicalDeliveries.length && input.retiringDeliveries.length) {
    reasons.push("DELIVERY_REFERENCE_CONFLICT");
  }

  if (input.canonicalLoopPublications.length || input.retiringLoopPublications.length) {
    reasons.push("LOOP_PUBLICATION_CONFLICT");
  }

  const loopBlock = reasons.includes("LOOP_PUBLICATION_CONFLICT");
  const decision: MergeDecision = loopBlock ? "BLOCK" : reasons.length ? "HOLD" : "SAFE";
  return { decision, reasons, collisions };
}

async function loadMergeState(sql: any, titleId: string) {
  const [
    title,
    rights,
    buyers,
    assets,
    deliveries,
    publications,
  ] = await Promise.all([
    sql<MergeTitle>`select id,name,slug,language,status,owner_user_id,year,runtime_minutes,original_language from public.bridge_titles where id=${titleId} limit 1`,
    sql<MergeRights>`select id,territories,languages,window_start,window_end,exclusivity,status from public.bridge_rights_grants where title_id=${titleId} order by created_at`,
    sql`select * from public.bridge_buyer_title_access where title_id=${titleId} order by buyer_user_id`,
    sql`select id,asset_group,asset_type,version,language,codec,s3_key,checksum_sha256,processing_state from public.bridge_asset_versions where title_id=${titleId} order by asset_group,asset_type,version,language`,
    sql`select id,destination,package_version,rights_grant_id,qc_case_id,asset_version_ids,readiness_state,authorized_at from public.bridge_destination_packages where title_id=${titleId} order by destination,package_version`,
    sql`select id,bridge_title_id,loop_title_id,authorization_status,territories,languages,exploitation_models,window_start,window_end,approved_at,revoked_at from public.bridge_loop_publications where bridge_title_id=${titleId}`,
  ]);
  return {
    title: title[0] ?? null,
    rights,
    buyers,
    assets,
    deliveries,
    publications,
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
  .validator(z.object({
    canonicalTitleId: z.string().min(8),
    retiringTitleId: z.string().min(8),
    expectedDecision: z.literal("SAFE"),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.update_own");
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
      if (decision.decision !== "SAFE") throw new Error(`DUPLICATE_MERGE_${decision.decision}: ${decision.reasons.join(",")}`);

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
          await tx.query(`update public.${table} set title_id=$1 where title_id=$2`, [data.canonicalTitleId, data.retiringTitleId]);
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
