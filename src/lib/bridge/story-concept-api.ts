/**
 * Story / Concept submission – server functions (RPC).
 * Pattern matches titles.ts (not named *.server.ts).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import {
  STORY_CONCEPT_ENABLED,
  CURATION_TRANSITIONS,
  type CurationStatus,
  type StoryConceptSubmission,
} from "./story-concept";

type ConceptRow = {
  id: string;
  title_id: string;
  logline: string | null;
  synopsis: string | null;
  treatment_url: string | null;
  screenplay_url: string | null;
  genre: string[] | null;
  estimated_budget_range: string | null;
  target_platforms: string[] | null;
  curation_status: string;
  admin_notes: string | null;
  introduced_to_buyers_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  reviewed_by?: string | null;
  reviewed_at?: string | Date | null;
  fee_certified_at?: string | Date | null;
};

function asIso(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapConcept(r: ConceptRow): StoryConceptSubmission {
  return {
    id: r.id,
    title_id: r.title_id,
    logline: r.logline,
    synopsis: r.synopsis,
    // Legacy external URLs are untrusted and never exposed as private materials.
    treatment_url: null,
    screenplay_url: null,
    genre: r.genre ?? [],
    estimated_budget_range: r.estimated_budget_range,
    target_platforms: r.target_platforms ?? [],
    curation_status: r.curation_status as CurationStatus,
    admin_notes: r.admin_notes,
    introduced_to_buyers_at: asIso(r.introduced_to_buyers_at),
    created_at: asIso(r.created_at) ?? "",
    updated_at: asIso(r.updated_at) ?? "",
    reviewed_by: r.reviewed_by ?? null,
    reviewed_at: asIso(r.reviewed_at),
    fee_certified_at: asIso(r.fee_certified_at),
  };
}

function slugify(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "concept"}-${id.slice(0, 6)}`;
}

function migrationHint(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /bridge_story_concept_submissions|submission_type|does not exist|undefined_column|undefined_table/i.test(
      msg,
    )
  ) {
    throw new Error(
      "Story/Concept tables are not installed yet. Apply migration 20261027_story_concept_submission.sql on Supabase, then retry.",
    );
  }
  throw err instanceof Error ? err : new Error(msg);
}

function requireCurationStaff(actor: { internalRole?: string | null }) {
  if (!actor.internalRole) throw new Error("Forbidden");
  // Align with rights/QC operators — not read-only viewers.
  assertPermission(actor as Parameters<typeof assertPermission>[0], "title.rights_review");
}

const createPayloadSchema = z.object({
  titleName: z.string().min(1).max(160),
  idempotencyKey: z.string().uuid(),
  logline: z.string().min(10).max(500),
  synopsis: z.string().min(40).max(8000),
  genre: z.array(z.string().min(1).max(40)).max(12).default([]),
  estimatedBudgetRange: z.string().max(80).optional(),
  targetPlatforms: z.array(z.string().min(1).max(40)).max(12).default([]),
  language: z.string().min(2).max(40).default("Malayalam"),
});

function hashCreatePayload(data: z.infer<typeof createPayloadSchema>): string {
  return createHash("sha256").update(JSON.stringify({
    titleName: data.titleName,
    logline: data.logline,
    synopsis: data.synopsis,
    genre: data.genre,
    estimatedBudgetRange: data.estimatedBudgetRange ?? null,
    targetPlatforms: data.targetPlatforms,
    language: data.language,
  })).digest("hex");
}

export const createStoryConceptSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createPayloadSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    if (!STORY_CONCEPT_ENABLED) throw new Error("Story / Concept submissions are not enabled yet.");
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "title.create");
    const sql = await getSql();
    const requestHash = hashCreatePayload(data);

    try {
      const result = await sql.transaction(async (tx) => {
        // Serialize retries for this actor/key before checking or creating anything.
        await tx`select pg_advisory_xact_lock(hashtext(${actor.userId}), hashtext(${data.idempotencyKey}))`;
        const existing = await tx<{
          request_hash: string;
          title_id: string;
          concept_id: string;
        }>`
          select request_hash, title_id, concept_id
          from bridge_story_concept_idempotency
          where actor_user_id = ${actor.userId} and idempotency_key = ${data.idempotencyKey}
          limit 1
        `;

        if (existing[0]) {
          if (existing[0].request_hash !== requestHash) {
            throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
          }
          const replay = await tx<ConceptRow>`
            select * from bridge_story_concept_submissions where id = ${existing[0].concept_id} limit 1
          `;
          if (!replay[0] || replay[0].title_id !== existing[0].title_id) {
            throw new Error("IDEMPOTENCY_RECORD_INTEGRITY_ERROR");
          }
          const owner = await tx<{ owner_user_id: string }>`
            select owner_user_id from bridge_titles where id = ${existing[0].title_id} limit 1
          `;
          if (owner[0]?.owner_user_id !== actor.userId) throw new Error("Forbidden");
          return { titleId: existing[0].title_id, concept: mapConcept(replay[0]) };
        }

        const titleId = randomBytes(16).toString("hex");
        const slug = slugify(data.titleName, titleId);
        await tx`
          insert into bridge_titles (
            id, slug, name, owner_user_id, owner_account_type, status,
            synopsis, language, content_type, owner_organization_id, submission_type
          ) values (
            ${titleId}, ${slug}, ${data.titleName}, ${actor.userId}, ${actor.accountType},
            'DRAFT', ${data.synopsis}, ${data.language}, 'OTHER',
            ${actor.accountType === "studio" ? actor.organizationId ?? null : null}, 'story_concept'
          )
        `;
        await tx`
          insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
          values (${titleId}, null, 'DRAFT', ${actor.userId}, 'story concept submission received')
        `;
        const rows = await tx<ConceptRow>`
          insert into bridge_story_concept_submissions (
            title_id, logline, synopsis, genre, estimated_budget_range,
            target_platforms, curation_status
          ) values (
            ${titleId}, ${data.logline}, ${data.synopsis}, ${data.genre},
            ${data.estimatedBudgetRange ?? null}, ${data.targetPlatforms}, 'PENDING_REVIEW'
          )
          returning *
        `;
        const concept = rows[0];
        if (!concept) throw new Error("STORY_CONCEPT_CREATE_FAILED");

        await tx`
          insert into bridge_story_concept_idempotency (
            actor_user_id, idempotency_key, request_hash, title_id, concept_id
          ) values (
            ${actor.userId}, ${data.idempotencyKey}, ${requestHash}, ${titleId}, ${concept.id}
          )
        `;
        await writeAudit({
          actorUserId: actor.userId,
          action: "story_concept.create",
          entityType: "bridge_story_concept_submission",
          entityId: concept.id,
          metadata: { titleId, status: "PENDING_REVIEW" },
        }, tx);
        return { titleId, concept: mapConcept(concept) };
      });
      return result;
    } catch (err) {
      migrationHint(err);
    }
  });

export const listMyStoryConcepts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();

    try {
      const rows = await sql<ConceptRow & { title_name: string }>`
        select c.*, t.name as title_name
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where t.submission_type = 'story_concept'
          and (t.owner_user_id = ${actor.userId}
           or (
             t.owner_account_type = 'studio'
             and t.owner_organization_id is not null
             and t.owner_organization_id = ${actor.organizationId ?? null}
           ))
        order by c.created_at desc
        limit 100
      `;

      return {
        concepts: rows.map((r) => ({
          ...mapConcept(r),
          titleName: r.title_name,
        })),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/bridge_story_concept_submissions|does not exist|undefined_table/i.test(msg)) {
        throw new Error('Story Concept storage is unavailable. No empty state was assumed.');
      }
      throw err;
    }
  });

export const getStoryConceptById = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ conceptId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const rows = await sql<ConceptRow & { title_name: string; language: string; owner_user_id: string; owner_organization_id: string | null; fee_certified_at: string | Date | null }>`
      select c.*, t.name as title_name, t.language, t.owner_user_id, t.owner_organization_id
      from bridge_story_concept_submissions c
      join bridge_titles t on t.id = c.title_id
      where c.id = ${data.conceptId} and t.submission_type = 'story_concept'
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Story concept not found");
    const isOwner = row.owner_user_id === actor.userId ||
      (actor.accountType === "studio" && !!actor.organizationId && row.owner_organization_id === actor.organizationId);
    const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
    if (!isOwner && !isAdmin) throw new Error("Story concept not found");
    return { concept: { ...mapConcept(row), titleName: row.title_name, language: row.language, feeCertified: Boolean(row.fee_certified_at) } };
  });

export const listPendingStoryConcepts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") throw new Error("Admin access required");
    const sql = await getSql();
    const rows = await sql<ConceptRow & { title_name: string; owner_user_id: string }>`
      select c.*, t.name as title_name, t.owner_user_id
      from bridge_story_concept_submissions c
      join bridge_titles t on t.id = c.title_id
      where t.submission_type = 'story_concept'
        and c.curation_status in ('PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED')
      order by c.created_at asc limit 200
    `;
    return { concepts: rows.map((r) => ({ ...mapConcept(r), titleName: r.title_name, ownerUserId: r.owner_user_id })) };
  });

export const updateStoryConceptCuration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    id: z.string().uuid(),
    status: z.enum(["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "BUYER_EVALUATION_APPROVED"]),
    adminNotes: z.string().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") throw new Error("Admin access required");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const existing = await tx<ConceptRow>`select * from bridge_story_concept_submissions where id = ${data.id} for update`;
      const current = existing[0];
      if (!current) throw new Error("Not found");
      const from = current.curation_status;
      const transitions: Record<string, string[]> = {
        PENDING_REVIEW: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
        CHANGES_REQUESTED: ["PENDING_REVIEW", "REJECTED"],
        APPROVED: ["BUYER_EVALUATION_APPROVED", "CHANGES_REQUESTED", "REJECTED"],
        REJECTED: ["PENDING_REVIEW"],
        BUYER_EVALUATION_APPROVED: ["APPROVED", "REJECTED"],
      };
      if (!transitions[from]?.includes(data.status)) throw new Error(`Invalid curation transition: ${from} → ${data.status}`);
      if (data.status === "BUYER_EVALUATION_APPROVED" && !current.fee_certified_at) {
        throw new Error("Fee certification is required before buyer / investor evaluation can be unlocked");
      }
      const rows = await tx<ConceptRow>`
        update bridge_story_concept_submissions
        set curation_status = ${data.status}, admin_notes = case when ${data.adminNotes !== undefined} then ${data.adminNotes ?? null} else admin_notes end,
            reviewed_by = ${actor.userId}, reviewed_at = now(), updated_at = now(),
            introduced_to_buyers_at = case when ${data.status} = 'BUYER_EVALUATION_APPROVED' then coalesce(introduced_to_buyers_at, now()) else null end
        where id = ${data.id} returning *
      `;
      const concept = rows[0];
      if (!concept) throw new Error("Not found");
      await writeAudit({
        actorUserId: actor.userId, action: "story_concept.curation_update",
        entityType: "bridge_story_concept_submission", entityId: concept.id,
        metadata: { from, status: data.status, reviewerUserId: actor.userId, comments: data.adminNotes ?? null },
      }, tx);
      return { concept: mapConcept(concept) };
    });
  });
