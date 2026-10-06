import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

export type DuplicateReviewStatus =
  | "DETECTED"
  | "REVIEW_REQUIRED"
  | "HOLD"
  | "APPROVED"
  | "RECONCILIATION_READY"
  | "RECONCILED"
  | "REJECTED"
  | "ROLLED_BACK";

export const KNOWN_DUPLICATE_CANDIDATES = [
  {
    candidateTitleId: "4334e6029497ba74d042cb49157d6ccc",
    canonicalTitleId: "legacy-film-7",
    label: "Jananam 1947 Pranayam Thudarunnu",
    identity: "CONFIRMED" as const,
    proposedAction: "RETAIN_CANONICAL" as const,
  },
  {
    candidateTitleId: "legacy-film-49",
    canonicalTitleId: "legacy-film-48",
    label: "Sri Balaji Photo Studio",
    identity: "CONFIRMED" as const,
    proposedAction: "RETAIN_CANONICAL" as const,
  },
  {
    candidateTitleId: "legacy-film-55",
    canonicalTitleId: "legacy-film-54",
    label: "AANDAAL",
    identity: "UNCERTAIN" as const,
    proposedAction: "HOLD_FOR_RIGHTS" as const,
  },
] as const;

type ReviewRow = {
  id: string;
  candidate_title_id: string;
  canonical_title_id: string | null;
  status: DuplicateReviewStatus;
  identity_confidence: string;
  identity_evidence: unknown;
  rights_conflict_status: string;
  territory_conflict_status: string;
  window_conflict_status: string;
  asset_reference_status: string;
  delivery_reference_status: string;
  buyer_mapping_status: string;
  loop_identity_status: string;
  proposed_action: string;
  reviewer_id: string | null;
  reviewed_at: string | Date | null;
  approval_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function iso(value: string | Date | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

async function actorFor(userId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (!actor.internalRole) throw new Error("Forbidden");
  assertPermission(actor, "title.read_catalog");
  return actor;
}

export const listDuplicateReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    const sql = await getSql();
    const rows = await sql<ReviewRow>`
      select *
      from bridge_title_duplicate_reviews
      order by updated_at desc
      limit 200
    `;

    const known = await Promise.all(
      KNOWN_DUPLICATE_CANDIDATES.map(async (candidate) => {
        const existing = rows.find((row) => row.candidate_title_id === candidate.candidateTitleId);
        if (existing) return null;
        const titles = await sql<{ id: string; name: string; status: string }>`
          select id, name, status
          from bridge_titles
          where id in (${candidate.candidateTitleId}, ${candidate.canonicalTitleId})
        `;
        const byId = new Map(titles.map((title) => [title.id, title]));
        if (!byId.has(candidate.candidateTitleId) || !byId.has(candidate.canonicalTitleId)) return null;
        return {
          id: `known:${candidate.candidateTitleId}`,
          candidateTitleId: candidate.candidateTitleId,
          canonicalTitleId: candidate.canonicalTitleId,
          candidateName: byId.get(candidate.candidateTitleId)?.name ?? candidate.label,
          canonicalName: byId.get(candidate.canonicalTitleId)?.name ?? candidate.label,
          candidateStatus: byId.get(candidate.candidateTitleId)?.status ?? "UNKNOWN",
          canonicalStatus: byId.get(candidate.canonicalTitleId)?.status ?? "UNKNOWN",
          status: "REVIEW_REQUIRED" as const,
          identityConfidence: candidate.identity,
          proposedAction: candidate.proposedAction,
          persisted: false,
        };
      }),
    );

    return {
      reviews: rows.map((row) => ({
        id: row.id,
        candidateTitleId: row.candidate_title_id,
        canonicalTitleId: row.canonical_title_id,
        status: row.status,
        identityConfidence: row.identity_confidence,
        identityEvidence: row.identity_evidence,
        rightsConflictStatus: row.rights_conflict_status,
        territoryConflictStatus: row.territory_conflict_status,
        windowConflictStatus: row.window_conflict_status,
        assetReferenceStatus: row.asset_reference_status,
        deliveryReferenceStatus: row.delivery_reference_status,
        buyerMappingStatus: row.buyer_mapping_status,
        loopIdentityStatus: row.loop_identity_status,
        proposedAction: row.proposed_action,
        reviewerId: row.reviewer_id,
        reviewedAt: iso(row.reviewed_at),
        approvalId: row.approval_id,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        persisted: true,
      })),
      knownCandidates: known.filter(Boolean),
      actor: actor.userId,
    };
  });

const openInput = z.object({
  candidateTitleId: z.string().min(1),
  canonicalTitleId: z.string().min(1),
});

export const openDuplicateReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(openInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    assertPermission(actor, "title.license");
    if (data.candidateTitleId === data.canonicalTitleId) throw new Error("Candidate and canonical IDs must differ.");

    const sql = await getSql();
    const titles = await sql<{ id: string; name: string }>`
      select id, name from bridge_titles
      where id in (${data.candidateTitleId}, ${data.canonicalTitleId})
    `;
    if (titles.length !== 2) throw new Error("Both title records must exist before review.");

    const existing = await sql<{ id: string }>`
      select id from bridge_title_duplicate_reviews
      where candidate_title_id = ${data.candidateTitleId}
        and status not in ('REJECTED','ROLLED_BACK')
      limit 1
    `;
    if (existing[0]) return { ok: true, reviewId: existing[0].id };

    const reviewId = randomUUID();
    await sql`
      insert into bridge_title_duplicate_reviews (
        id, candidate_title_id, canonical_title_id, status, identity_confidence,
        proposed_action, loop_identity_status
      ) values (
        ${reviewId}, ${data.candidateTitleId}, ${data.canonicalTitleId}, 'REVIEW_REQUIRED',
        'UNCERTAIN', 'HOLD_FOR_IDENTITY', 'BLOCKED'
      )
    `;
    await sql`
      insert into bridge_title_reconciliation_events (
        review_id, event_type, actor_user_id, object_type, object_id, metadata
      ) values (
        ${reviewId}, 'DUPLICATE_REVIEW_CREATED', ${actor.userId},
        'bridge_title', ${data.candidateTitleId},
        ${JSON.stringify({ canonicalTitleId: data.canonicalTitleId })}::jsonb
      )
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "duplicate_review.created",
      entityType: "bridge_title_duplicate_review",
      entityId: reviewId,
      metadata: { candidateTitleId: data.candidateTitleId, canonicalTitleId: data.canonicalTitleId },
    });
    return { ok: true, reviewId };
  });

const decisionInput = z.object({
  reviewId: z.string().min(1),
  decision: z.enum(["HOLD", "NO_MERGE", "APPROVE"]),
  identityConfidence: z.enum(["CONFIRMED", "PROBABLE", "UNCERTAIN", "CONFLICT"]),
  rightsConflictStatus: z.enum(["CLEAR", "CONFLICT", "UNKNOWN", "NOT_APPLICABLE"]),
  territoryConflictStatus: z.enum(["CLEAR", "OVERLAP", "CONFLICT", "UNKNOWN", "NOT_APPLICABLE"]),
  windowConflictStatus: z.enum(["CLEAR", "OVERLAP", "CONFLICT", "UNKNOWN", "NOT_APPLICABLE"]),
  assetReferenceStatus: z.enum(["CLEAR", "CONFLICT", "UNKNOWN", "NOT_APPLICABLE"]),
  deliveryReferenceStatus: z.enum(["CLEAR", "CONFLICT", "UNKNOWN", "NOT_APPLICABLE"]),
  buyerMappingStatus: z.enum(["CLEAR", "CONFLICT", "UNKNOWN", "NOT_APPLICABLE"]),
});

export const decideDuplicateReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(decisionInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    assertPermission(actor, "title.license");
    const sql = await getSql();

    const rows = await sql<ReviewRow>`
      select * from bridge_title_duplicate_reviews where id = ${data.reviewId} limit 1
    `;
    const review = rows[0];
    if (!review) throw new Error("Duplicate review not found.");

    if (data.decision === "APPROVE") {
      const blocking = [
        data.identityConfidence === "CONFLICT" || data.identityConfidence === "UNCERTAIN",
        ["CONFLICT", "UNKNOWN", "OVERLAP"].includes(data.rightsConflictStatus),
        ["CONFLICT", "UNKNOWN", "OVERLAP"].includes(data.territoryConflictStatus),
        ["CONFLICT", "UNKNOWN", "OVERLAP"].includes(data.windowConflictStatus),
        ["CONFLICT", "UNKNOWN"].includes(data.assetReferenceStatus),
        ["CONFLICT", "UNKNOWN"].includes(data.deliveryReferenceStatus),
        ["CONFLICT", "UNKNOWN"].includes(data.buyerMappingStatus),
      ];
      if (blocking.some(Boolean)) {
        throw new Error("Reconciliation cannot be approved while identity, rights, territory/window, asset, delivery, or buyer checks are unresolved.");
      }
    }

    const status: DuplicateReviewStatus =
      data.decision === "APPROVE" ? "RECONCILIATION_READY" :
      data.decision === "NO_MERGE" ? "REJECTED" : "HOLD";

    const proposedAction =
      data.decision === "APPROVE" ? "REMAP_REFERENCES" :
      data.decision === "NO_MERGE" ? "NO_MERGE" :
      review.proposed_action;

    const approvalId = data.decision === "APPROVE" ? randomUUID() : null;

    await sql`
      update bridge_title_duplicate_reviews
      set status = ${status},
          identity_confidence = ${data.identityConfidence},
          rights_conflict_status = ${data.rightsConflictStatus},
          territory_conflict_status = ${data.territoryConflictStatus},
          window_conflict_status = ${data.windowConflictStatus},
          asset_reference_status = ${data.assetReferenceStatus},
          delivery_reference_status = ${data.deliveryReferenceStatus},
          buyer_mapping_status = ${data.buyerMappingStatus},
          proposed_action = ${proposedAction},
          reviewer_id = ${actor.userId},
          reviewed_at = now(),
          approval_id = ${approvalId},
          updated_at = now()
      where id = ${data.reviewId}
    `;

    const eventType = data.decision === "APPROVE" ? "RECONCILIATION_APPROVED" :
      data.decision === "NO_MERGE" ? "CONFLICT_DETECTED" : "CONFLICT_DETECTED";

    await sql`
      insert into bridge_title_reconciliation_events (
        review_id, event_type, actor_user_id, object_type, object_id, approval_id, metadata
      ) values (
        ${data.reviewId}, ${eventType}, ${actor.userId},
        'bridge_title', ${review.candidate_title_id}, ${approvalId},
        ${JSON.stringify({
          decision: data.decision,
          identityConfidence: data.identityConfidence,
          rightsConflictStatus: data.rightsConflictStatus,
          territoryConflictStatus: data.territoryConflictStatus,
          windowConflictStatus: data.windowConflictStatus,
          assetReferenceStatus: data.assetReferenceStatus,
          deliveryReferenceStatus: data.deliveryReferenceStatus,
          buyerMappingStatus: data.buyerMappingStatus,
        })}::jsonb
      )
    `;

    await writeAudit({
      actorUserId: actor.userId,
      action: `duplicate_review.${data.decision.toLowerCase()}`,
      entityType: "bridge_title_duplicate_review",
      entityId: data.reviewId,
      metadata: { candidateTitleId: review.candidate_title_id, canonicalTitleId: review.canonical_title_id },
    });

    return { ok: true, status, approvalId };
  });
