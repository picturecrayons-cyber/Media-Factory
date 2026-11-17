import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

const SOURCE_TABLES = [
  "films_film",
  "films_filmdraft",
  "films_filmbuyermapping",
  "films_status",
  "films_viewhistory",
] as const;

type LegacyLinkRow = {
  source_table: string;
  legacy_id: string;
  review_status: string;
  resolution_status: string;
  candidate_bridge_title_id: string | null;
  candidate_order_id: string | null;
  candidate_title_name: string | null;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
};

async function requireSuperAdmin(userId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (actor.internalRole !== "super_admin") {
    throw new Error("Super Admin access is required to resolve legacy mappings");
  }
  return actor;
}

export const listLegacyLinkReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.userId);
    const sql = await getSql();
    const [rows, targets, counts] = await Promise.all([
      sql<LegacyLinkRow>`
        select
          l.source_table,
          l.legacy_id,
          l.review_status,
          l.resolution_status,
          l.candidate_bridge_title_id,
          l.candidate_order_id::text as candidate_order_id,
          t.name as candidate_title_name,
          l.reviewed_by,
          l.reviewed_at
        from streamvista_legacy_links l
        left join bridge_titles t on t.id = l.candidate_bridge_title_id
        where l.review_status = 'pending'
          and l.resolution_status = 'unresolved'
        order by
          case l.source_table
            when 'films_film' then 1
            when 'films_filmdraft' then 2
            when 'films_filmbuyermapping' then 3
            when 'films_status' then 4
            when 'films_viewhistory' then 5
            else 6
          end,
          l.legacy_id
        limit 250
      `,
      sql<{ id: string; name: string; status: string }>`
        select id, name, status
        from bridge_titles
        where merged_into_title_id is null
        order by name
        limit 500
      `,
      sql<{ source_table: string; count: number }>`
        select source_table, count(*)::int as count
        from streamvista_legacy_links
        where review_status = 'pending'
          and resolution_status = 'unresolved'
        group by source_table
        order by source_table
      `,
    ]);

    return {
      rows: rows.map((row) => ({
        sourceTable: row.source_table,
        legacyId: row.legacy_id,
        reviewStatus: row.review_status,
        resolutionStatus: row.resolution_status,
        candidateBridgeTitleId: row.candidate_bridge_title_id,
        candidateOrderId: row.candidate_order_id,
        candidateTitleName: row.candidate_title_name,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at
          ? row.reviewed_at instanceof Date
            ? row.reviewed_at.toISOString()
            : String(row.reviewed_at)
          : null,
      })),
      targets,
      counts,
      totalPending: rows.length,
    };
  });

const verifyInput = z.object({
  sourceTable: z.enum(SOURCE_TABLES),
  legacyId: z.string().min(1).max(256),
  decision: z.literal("verify"),
  bridgeTitleId: z.string().min(1).max(256),
  evidenceNote: z.string().trim().min(20).max(2000),
});

const rejectInput = z.object({
  sourceTable: z.enum(SOURCE_TABLES),
  legacyId: z.string().min(1).max(256),
  decision: z.literal("reject"),
  evidenceNote: z.string().trim().min(20).max(2000),
});

const decisionInput = z.discriminatedUnion("decision", [verifyInput, rejectInput]);

export const decideLegacyLinkReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(decisionInput)
  .handler(async ({ context, data }) => {
    const actor = await requireSuperAdmin(context.userId);
    const sql = await getSql();

    return await sql.transaction(async (tx) => {
      const [link] = await tx<{
        source_table: string;
        legacy_id: string;
        review_status: string;
        resolution_status: string;
        candidate_bridge_title_id: string | null;
        candidate_order_id: string | null;
        bridge_title_id: string | null;
        order_id: string | null;
      }>`
        select
          source_table, legacy_id, review_status, resolution_status,
          candidate_bridge_title_id, candidate_order_id,
          bridge_title_id, order_id
        from streamvista_legacy_links
        where source_table = ${data.sourceTable}
          and legacy_id = ${data.legacyId}
        for update
      `;
      if (!link) throw new Error("Legacy mapping record was not found.");
      if (link.review_status !== "pending" || link.resolution_status !== "unresolved") {
        throw new Error("This legacy mapping has already been reviewed. Refresh the queue.");
      }
      if (link.bridge_title_id !== null || link.order_id !== null) {
        throw new Error("Unresolved mapping unexpectedly has an active target. Stop and investigate.");
      }

      let selectedTitleName: string | null = null;
      if (data.decision === "verify") {
        const [target] = await tx<{ id: string; name: string; merged_into_title_id: string | null }>`
          select id, name, merged_into_title_id
          from bridge_titles
          where id = ${data.bridgeTitleId}
          for share
        `;
        if (!target || target.merged_into_title_id !== null) {
          throw new Error("Select an existing canonical Bridge title, not a merged alias.");
        }
        selectedTitleName = target.name;

        await tx`
          update streamvista_legacy_links
          set bridge_title_id = ${target.id},
              order_id = null,
              review_status = 'verified',
              resolution_status = 'resolved',
              reviewed_by = ${actor.userId},
              reviewed_at = now()
          where source_table = ${data.sourceTable}
            and legacy_id = ${data.legacyId}
            and review_status = 'pending'
            and resolution_status = 'unresolved'
        `;
      } else {
        await tx`
          update streamvista_legacy_links
          set bridge_title_id = null,
              order_id = null,
              review_status = 'rejected',
              resolution_status = 'rejected',
              reviewed_by = ${actor.userId},
              reviewed_at = now()
          where source_table = ${data.sourceTable}
            and legacy_id = ${data.legacyId}
            and review_status = 'pending'
            and resolution_status = 'unresolved'
        `;
      }

      await writeAudit({
        actorUserId: actor.userId,
        action: data.decision === "verify"
          ? "legacy_link.mapping_verified"
          : "legacy_link.mapping_rejected",
        entityType: "streamvista_legacy_link",
        entityId: `${data.sourceTable}:${data.legacyId}`,
        metadata: {
          sourceTable: data.sourceTable,
          legacyId: data.legacyId,
          previousCandidateBridgeTitleId: link.candidate_bridge_title_id,
          previousCandidateOrderId: link.candidate_order_id,
          selectedBridgeTitleId: data.decision === "verify" ? data.bridgeTitleId : null,
          selectedBridgeTitleName: selectedTitleName,
          decision: data.decision,
          evidenceNote: data.evidenceNote,
          reviewerUserId: actor.userId,
        },
      }, tx);

      return {
        ok: true,
        decision: data.decision,
        sourceTable: data.sourceTable,
        legacyId: data.legacyId,
        bridgeTitleId: data.decision === "verify" ? data.bridgeTitleId : null,
      };
    });
  });
