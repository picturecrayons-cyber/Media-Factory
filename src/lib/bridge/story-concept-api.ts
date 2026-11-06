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
    treatment_url: r.treatment_url,
    screenplay_url: r.screenplay_url,
    genre: r.genre ?? [],
    estimated_budget_range: r.estimated_budget_range,
    target_platforms: r.target_platforms ?? [],
    curation_status: r.curation_status as CurationStatus,
    admin_notes: r.admin_notes,
    introduced_to_buyers_at: asIso(r.introduced_to_buyers_at),
    created_at: asIso(r.created_at) ?? "",
    updated_at: asIso(r.updated_at) ?? "",
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
  idempotencyKey: z.string().uuid(),
  paymentId: z.string().min(8).max(160).optional(),
  titleName: z.string().trim().min(1).max(160),
  logline: z.string().trim().min(10).max(500),
  synopsis: z.string().trim().min(40).max(8000),
  genre: z.array(z.string().min(1).max(40)).max(12).default([]),
  estimatedBudgetRange: z.string().max(80).optional(),
  targetPlatforms: z.array(z.string().min(1).max(40)).max(12).default([]),
  treatmentUrl: z.string().url().max(500).optional().or(z.literal("")),
  screenplayUrl: z.string().url().max(500).optional().or(z.literal("")),
  language: z.string().trim().min(2).max(40).default("Malayalam"),
});

export const createStoryConceptSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createPayloadSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    if (!STORY_CONCEPT_ENABLED) {
      throw new Error("Story / Concept submissions are not enabled yet.");
    }

    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "title.create");

    const sql = await getSql();

    const requestHash = createHash("sha256")
      .update(JSON.stringify({
        titleName: data.titleName.trim(),
        logline: data.logline.trim(),
        synopsis: data.synopsis.trim(),
        genre: data.genre,
        estimatedBudgetRange: data.estimatedBudgetRange ?? null,
        targetPlatforms: data.targetPlatforms,
        treatmentUrl: data.treatmentUrl || null,
        screenplayUrl: data.screenplayUrl || null,
        language: data.language,
        paymentId: data.paymentId ?? null,
      }))
      .digest("hex");

    try {
      const result = await sql.transaction(async (tx) => {
        // Serialize retries for this actor/key before checking the durable record.
        await tx`select pg_advisory_xact_lock(hashtextextended(${`story-concept:${actor.userId}:${data.idempotencyKey}`}, 0))`;
        const prior = await tx<{ request_hash: string; title_id: string; concept_id: string }>`
          select request_hash, title_id, concept_id
          from bridge_story_concept_idempotency
          where actor_user_id = ${actor.userId}
            and idempotency_key = ${data.idempotencyKey}::uuid
          limit 1
        `;
        if (prior[0]) {
          if (prior[0].request_hash !== requestHash) {
            throw new Error("Idempotency key was already used with a different submission.");
          }
          const existing = await tx<ConceptRow>`
            select * from bridge_story_concept_submissions where id = ${prior[0].concept_id}::uuid limit 1
          `;
          if (!existing[0]) throw new Error("Previously accepted submission could not be recovered.");
          return { titleId: prior[0].title_id, concept: existing[0] };
        }

        const service = await tx<{ active: boolean }>`
          select active from bridge_service_catalog
          where code = 'STORY_CONCEPT_NETWORK_SUBMISSION'
          limit 1
        `;
        if (!service[0]?.active) {
          throw new Error("Story / Concept network submission is locked pending service certification.");
        }
        if (!data.paymentId) {
          throw new Error("A verified Story / Concept submission payment is required.");
        }
        const rate = await tx<{ base_price_paise: number | null }>`
          select base_price_paise
          from bridge_service_rates
          where service_code = 'STORY_CONCEPT_NETWORK_SUBMISSION'
            and active = true
            and currency = 'INR'
            and effective_from <= now()
            and (effective_to is null or effective_to > now())
          order by effective_from desc, version desc
          limit 1
        `;
        if (!rate[0] || rate[0].base_price_paise === null || Number(rate[0].base_price_paise) <= 0) {
          throw new Error("A certified active Story / Concept submission rate is required.");
        }
        const payment = await tx<{ id: string; amount_paise: number }>`
          select id, amount_paise
          from bridge_payments
          where id = ${data.paymentId}
            and user_id = ${actor.userId}
            and purpose = 'story_concept_submission'
            and status = 'captured'
            and verified_at is not null
            and title_id is null
          for update
        `;
        if (!payment[0] || Number(payment[0].amount_paise) !== Number(rate[0].base_price_paise)) {
          throw new Error("No matching captured Story / Concept payment at the certified rate was found.");
        }

        const titleId = randomBytes(16).toString("hex");
        const slug = slugify(data.titleName, titleId);
        await tx`
          insert into bridge_titles (
            id, slug, name, owner_user_id, owner_account_type, status,
            synopsis, language, content_type, owner_organization_id, submission_type
          ) values (
            ${titleId}, ${slug}, ${data.titleName.trim()}, ${actor.userId},
            ${actor.accountType}, 'DRAFT', ${data.synopsis.trim()}, ${data.language},
            'OTHER', ${actor.accountType === "studio" ? actor.organizationId ?? null : null},
            'story_concept'
          )
        `;
        await tx`
          insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
          values (${titleId}, null, 'DRAFT', ${actor.userId}, 'story concept submission received')
        `;
        const conceptRows = await tx<ConceptRow>`
          insert into bridge_story_concept_submissions (
            title_id, payment_id, logline, synopsis, treatment_url, screenplay_url,
            genre, estimated_budget_range, target_platforms, curation_status
          ) values (
            ${titleId}, ${data.paymentId}, ${data.logline.trim()}, ${data.synopsis.trim()},
            ${data.treatmentUrl || null}, ${data.screenplayUrl || null},
            ${data.genre}, ${data.estimatedBudgetRange ?? null}, ${data.targetPlatforms}, 'PENDING'
          )
          returning *
        `;
        const concept = conceptRows[0];
        if (!concept) throw new Error("Story concept create failed");
        await tx`
          insert into bridge_story_concept_idempotency
            (actor_user_id, idempotency_key, request_hash, title_id, concept_id)
          values
            (${actor.userId}, ${data.idempotencyKey}::uuid, ${requestHash}, ${titleId}, ${concept.id})
        `;
        await writeAudit({
          actorUserId: actor.userId,
          action: "story_concept.create",
          entityType: "bridge_story_concept_submission",
          entityId: concept.id,
          metadata: { titleId, idempotencyKey: data.idempotencyKey },
        }, tx);
        return { titleId, concept };
      });
      return { titleId: result.titleId, concept: mapConcept(result.concept) };
    } catch (err) {
      migrationHint(err);
    }
  });

export const listMyStoryConcepts = createServerFn({ method: "GET" })
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
        where t.owner_user_id = ${actor.userId}
           or (
             t.owner_account_type = 'studio'
             and t.owner_organization_id is not null
             and t.owner_organization_id = ${actor.organizationId ?? null}
           )
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
        return { concepts: [] };
      }
      throw err;
    }
  });

export const listPendingStoryConcepts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireCurationStaff(actor);

    const sql = await getSql();
    try {
      const rows = await sql<ConceptRow & { title_name: string; owner_user_id: string }>`
        select c.*, t.name as title_name, t.owner_user_id
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where c.curation_status in ('PENDING', 'UNDER_REVIEW', 'APPROVED')
        order by c.created_at asc
        limit 200
      `;

      return {
        concepts: rows.map((r) => ({
          ...mapConcept(r),
          titleName: r.title_name,
          ownerUserId: r.owner_user_id,
        })),
      };
    } catch (err) {
      migrationHint(err);
    }
  });

export const updateStoryConceptCuration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "INTRODUCED_TO_BUYERS"]),
      adminNotes: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireCurationStaff(actor);

    const sql = await getSql();
    try {
      const concept = await sql.transaction(async (tx) => {
        const existing = await tx<ConceptRow>`
          select * from bridge_story_concept_submissions where id = ${data.id}::uuid for update
        `;
        const current = existing[0];
        if (!current) throw new Error("Not found");
        const from = current.curation_status as CurationStatus;
        const allowed = CURATION_TRANSITIONS[from] ?? [];
        if (!allowed.includes(data.status)) {
          throw new Error(`Invalid curation transition: ${from} → ${data.status}`);
        }
        const rows = await tx<ConceptRow>`
          update bridge_story_concept_submissions
          set
            curation_status = ${data.status},
            admin_notes = ${data.adminNotes === undefined ? current.admin_notes : data.adminNotes},
            updated_at = now(),
            introduced_to_buyers_at = case
              when ${data.status} = 'INTRODUCED_TO_BUYERS' then coalesce(introduced_to_buyers_at, now())
              else introduced_to_buyers_at
            end
          where id = ${data.id}::uuid
          returning *
        `;
        const updated = rows[0];
        if (!updated) throw new Error("Not found");
        await writeAudit({
          actorUserId: actor.userId,
          action: "story_concept.curation_update",
          entityType: "bridge_story_concept_submission",
          entityId: updated.id,
          metadata: { from, status: data.status },
        }, tx);
        return updated;
      });
      return { concept: mapConcept(concept) };
    } catch (err) {
      migrationHint(err);
    }
  });
