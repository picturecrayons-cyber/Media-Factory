/**
 * Story / Concept submission – server functions (RPC).
 * Pattern matches titles.ts (not named *.server.ts).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
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
  rights_holder_name?: string | null;
  rights_basis?: string | null;
  third_party_materials_included?: boolean | null;
  rights_declaration_accepted_at?: string | Date | null;
  rights_declaration_version?: string | null;
  editorial_status?: string;
  editorial_reviewed_by?: string | null;
  editorial_reviewed_at?: string | Date | null;
  editorial_review_notes?: string | null;
  legal_status?: string;
  legal_reviewed_by?: string | null;
  legal_reviewed_at?: string | Date | null;
  legal_review_notes?: string | null;
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
    // External treatment/screenplay URLs are not exposed by the Founder desk.
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
    rights_holder_name: r.rights_holder_name ?? null,
    rights_basis: r.rights_basis ?? null,
    third_party_materials_included: r.third_party_materials_included ?? null,
    rights_declaration_accepted_at: asIso(r.rights_declaration_accepted_at),
    rights_declaration_version: r.rights_declaration_version ?? null,
    editorial_status: r.editorial_status ?? "NOT_AVAILABLE",
    editorial_reviewed_by: r.editorial_reviewed_by ?? null,
    editorial_reviewed_at: asIso(r.editorial_reviewed_at),
    editorial_review_notes: r.editorial_review_notes ?? null,
    legal_status: r.legal_status ?? "NOT_AVAILABLE",
    legal_reviewed_by: r.legal_reviewed_by ?? null,
    legal_reviewed_at: asIso(r.legal_reviewed_at),
    legal_review_notes: r.legal_review_notes ?? null,
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
  logline: z.string().min(10).max(500),
  synopsis: z.string().min(40).max(8000),
  genre: z.array(z.string().min(1).max(40)).max(12).default([]),
  estimatedBudgetRange: z.string().max(80).optional(),
  targetPlatforms: z.array(z.string().min(1).max(40)).max(12).default([]),
  treatmentUrl: z.string().url().max(500).optional().or(z.literal("")),
  screenplayUrl: z.string().url().max(500).optional().or(z.literal("")),
  language: z.string().min(2).max(40).default("Malayalam"),
  rightsHolderName: z.string().trim().min(2).max(200),
  rightsBasis: z.enum(["ORIGINAL_AUTHOR", "ASSIGNED", "LICENSED", "PUBLIC_DOMAIN", "OTHER"]),
  thirdPartyMaterialsIncluded: z.boolean(),
  rightsDeclarationAccepted: z.literal(true),
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

    const titleId = randomBytes(16).toString("hex");
    const slug = slugify(data.titleName, titleId);
    const sql = await getSql();

    try {
      await sql`
        insert into bridge_titles (
          id, slug, name, owner_user_id, owner_account_type, status,
          synopsis, language, content_type, owner_organization_id, submission_type
        ) values (
          ${titleId},
          ${slug},
          ${data.titleName},
          ${actor.userId},
          ${actor.accountType},
          ${"DRAFT"},
          ${data.synopsis},
          ${data.language},
          ${"OTHER"},
          ${actor.accountType === "studio" ? actor.organizationId ?? null : null},
          ${"story_concept"}
        )
      `;

      await sql`
        insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
        values (${titleId}, null, ${"DRAFT"}, ${actor.userId}, ${"story concept submission received"})
      `;

      const conceptRows = await sql<ConceptRow>`
        insert into bridge_story_concept_submissions (
          title_id, logline, synopsis, treatment_url, screenplay_url,
          genre, estimated_budget_range, target_platforms, curation_status,
          rights_holder_name, rights_basis, third_party_materials_included,
          rights_declaration_accepted_at, rights_declaration_version
        ) values (
          ${titleId},
          ${data.logline},
          ${data.synopsis},
          ${data.treatmentUrl || null},
          ${data.screenplayUrl || null},
          ${data.genre},
          ${data.estimatedBudgetRange ?? null},
          ${data.targetPlatforms},
          ${"PENDING"},
          ${data.rightsHolderName},
          ${data.rightsBasis},
          ${data.thirdPartyMaterialsIncluded},
          now(),
          ${"story-concept-rights-v1"}
        )
        returning *
      `;

      const concept = conceptRows[0];
      if (!concept) throw new Error("Story concept create failed");

      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.create",
        entityType: "bridge_story_concept_submission",
        entityId: concept.id,
        metadata: { titleId },
      });

      return {
        titleId,
        concept: mapConcept(concept),
      };
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
        where t.submission_type = 'story_concept'
          and (
            t.owner_user_id = ${actor.userId}
            or (
              t.owner_account_type = 'studio'
              and t.owner_organization_id is not null
              and t.owner_organization_id = ${actor.organizationId ?? null}
            )
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

export const listPendingStoryConcepts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireCurationStaff(actor);

    const sql = await getSql();
    try {
      const rows = await sql<
        ConceptRow & {
          title_name: string;
          owner_user_id: string;
          owner_account_type: string;
          author_name: string | null;
          author_organization_name: string | null;
        }
      >`
        select
          c.*,
          t.name as title_name,
          t.owner_user_id,
          t.owner_account_type,
          p.display_name as author_name,
          p.organization_name as author_organization_name
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        left join bridge_profiles p on p.user_id = t.owner_user_id
        where t.submission_type = 'story_concept'
          and c.curation_status <> 'REJECTED'
        order by c.created_at desc
        limit 200
      `;

      return {
        concepts: rows.map((r) => ({
          ...mapConcept(r),
          titleName: r.title_name,
          ownerUserId: r.owner_user_id,
          ownerAccountType: r.owner_account_type,
          authorName: r.author_name,
          authorOrganizationName: r.author_organization_name,
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
      status: z.enum([
        "PENDING",
        "UNDER_REVIEW",
        "APPROVED",
        "REJECTED",
        "INTRODUCED_TO_BUYERS",
      ]).optional(),
      adminNotes: z.string().max(2000).optional(),
    }).refine((value) => value.status !== undefined || value.adminNotes !== undefined, {
      message: "A status decision or internal note is required",
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireCurationStaff(actor);

    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const existing = await tx<ConceptRow>`
        select c.*
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where c.id = ${data.id}
          and t.submission_type = 'story_concept'
        for update of c
      `;
      const current = existing[0];
      if (!current) throw new Error("Not found");

      const from = current.curation_status as CurationStatus;
      const nextStatus = data.status ?? from;
      if (data.status && data.status !== from) {
        const allowed = CURATION_TRANSITIONS[from] ?? [];
        if (!allowed.includes(data.status)) {
          throw new Error(`Invalid curation transition: ${from} → ${data.status}`);
        }
      }

      const rightsDeclarationComplete = Boolean(
        current.rights_declaration_accepted_at &&
        current.rights_holder_name?.trim() &&
        current.rights_basis &&
        current.third_party_materials_included !== null &&
        current.third_party_materials_included !== undefined
      );
      if (nextStatus === "APPROVED" && !rightsDeclarationComplete) {
        throw new Error("A complete, accepted rights declaration is required before Story / Concept approval");
      }

      if (nextStatus === "INTRODUCED_TO_BUYERS" && !current.fee_certified_at) {
        throw new Error("Fee certification is required before buyer / investor evaluation can be unlocked");
      }

      const rows = await tx<ConceptRow>`
        update bridge_story_concept_submissions
        set
          curation_status = ${nextStatus},
          admin_notes = case
            when ${data.adminNotes !== undefined} then ${data.adminNotes ?? null}
            else admin_notes
          end,
          updated_at = now(),
          introduced_to_buyers_at = case
            when ${nextStatus} = 'INTRODUCED_TO_BUYERS'
              then coalesce(introduced_to_buyers_at, now())
            else introduced_to_buyers_at
          end
        where id = ${data.id}
        returning *
      `;
      const concept = rows[0];
      if (!concept) throw new Error("Not found");

      await writeAudit({
        actorUserId: actor.userId,
        action: data.status === undefined ? "story_concept.internal_note" : "story_concept.curation_update",
        entityType: "bridge_story_concept_submission",
        entityId: concept.id,
        metadata: {
          from,
          status: nextStatus,
          noteUpdated: data.adminNotes !== undefined,
        },
      }, tx);

      return { concept: mapConcept(concept) };
    });
  });
