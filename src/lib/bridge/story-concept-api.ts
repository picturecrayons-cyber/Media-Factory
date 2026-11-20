/**
 * Story / Concept submission – authenticated server functions.
 * Rights declaration, Editorial review and Legal review are separate controls.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, hasPermission } from "./rbac";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import {
  STORY_CONCEPT_ENABLED,
  CURATION_TRANSITIONS,
  canIntroduceStoryConceptToBuyers,
  hasCompleteRightsDeclaration,
  hasIndependentEditorialAndLegalApproval,
  type CurationStatus,
  type ReviewStatus,
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
  rights_holder_name: string | null;
  rights_basis: string | null;
  rights_basis_details: string | null;
  third_party_materials_included: boolean | null;
  third_party_materials_details: string | null;
  rights_declaration_accepted_at: string | Date | null;
  rights_declaration_version: string | null;
  editorial_status: string | null;
  editorial_reviewed_by: string | null;
  editorial_reviewed_at: string | Date | null;
  editorial_review_notes: string | null;
  legal_status: string | null;
  legal_reviewed_by: string | null;
  legal_reviewed_at: string | Date | null;
  legal_review_notes: string | null;
  fee_certified_at: string | Date | null;
};

function asIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapConcept(row: ConceptRow): StoryConceptSubmission {
  return {
    id: row.id,
    title_id: row.title_id,
    logline: row.logline,
    synopsis: row.synopsis,
    treatment_url: row.treatment_url,
    screenplay_url: row.screenplay_url,
    genre: row.genre ?? [],
    estimated_budget_range: row.estimated_budget_range,
    target_platforms: row.target_platforms ?? [],
    curation_status: row.curation_status as CurationStatus,
    admin_notes: row.admin_notes,
    introduced_to_buyers_at: asIso(row.introduced_to_buyers_at),
    created_at: asIso(row.created_at) ?? "",
    updated_at: asIso(row.updated_at) ?? "",
    rights_holder_name: row.rights_holder_name,
    rights_basis: row.rights_basis,
    rights_basis_details: row.rights_basis_details,
    third_party_materials_included: row.third_party_materials_included,
    third_party_materials_details: row.third_party_materials_details,
    rights_declaration_accepted_at: asIso(row.rights_declaration_accepted_at),
    rights_declaration_version: row.rights_declaration_version,
    editorial_status: (row.editorial_status ?? "PENDING") as ReviewStatus,
    editorial_reviewed_by: row.editorial_reviewed_by,
    editorial_reviewed_at: asIso(row.editorial_reviewed_at),
    editorial_review_notes: row.editorial_review_notes,
    legal_status: (row.legal_status ?? "PENDING") as ReviewStatus,
    legal_reviewed_by: row.legal_reviewed_by,
    legal_reviewed_at: asIso(row.legal_reviewed_at),
    legal_review_notes: row.legal_review_notes,
    fee_certified_at: asIso(row.fee_certified_at),
  };
}

function slugify(name: string, id: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${base || "concept"}-${id.slice(0, 6)}`;
}

function migrationHint(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/bridge_story_concept_submissions|submission_type|does not exist|undefined_column|undefined_table/i.test(message)) {
    throw new Error("Story/Concept schema is unavailable in this environment. Verify the environment's migration ledger and schema; do not replay Production migrations into Testing.");
  }
  throw error instanceof Error ? error : new Error(message);
}

function requireCurationQueueAccess(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (!hasPermission(actor, "title.editorial_review") && !hasPermission(actor, "title.rights_review")) {
    throw new Error("Forbidden");
  }
}

function requireEditorialReviewer(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (actor.internalRole !== "qc_reviewer" && actor.internalRole !== "super_admin") {
    throw new Error("Editorial reviewer role required");
  }
  assertPermission(actor, "title.editorial_review");
}

function requireLegalReviewer(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (actor.internalRole !== "legal_reviewer" && actor.internalRole !== "super_admin") {
    throw new Error("Legal reviewer role required");
  }
  assertPermission(actor, "title.rights_review");
}

const createPayloadSchema = z.object({
  titleName: z.string().trim().min(1).max(160),
  logline: z.string().min(10).max(500),
  synopsis: z.string().min(40).max(8000),
  genre: z.array(z.string().min(1).max(40)).max(12).default([]),
  estimatedBudgetRange: z.string().max(80).optional(),
  targetPlatforms: z.array(z.string().min(1).max(40)).max(12).default([]),
  treatmentUrl: z.string().url().max(500).optional().or(z.literal("")),
  screenplayUrl: z.string().url().max(500).optional().or(z.literal("")),
  language: z.string().min(2).max(40).default("Malayalam"),
  rightsHolderName: z.string().trim().min(2).max(160),
  rightsBasis: z.enum(["ORIGINAL_AUTHOR", "ASSIGNED", "LICENSED", "PUBLIC_DOMAIN", "OTHER"]),
  rightsBasisDetails: z.string().trim().max(2000).optional(),
  thirdPartyMaterialsIncluded: z.boolean(),
  thirdPartyMaterialsDetails: z.string().trim().max(4000).optional(),
  rightsDeclarationAccepted: z.literal(true),
}).superRefine((value, ctx) => {
  if (value.rightsBasis === "OTHER" && !value.rightsBasisDetails?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rightsBasisDetails"], message: "Explain the selected rights basis" });
  }
  if (value.thirdPartyMaterialsIncluded && !value.thirdPartyMaterialsDetails?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["thirdPartyMaterialsDetails"], message: "Describe the third-party material" });
  }
});

export const createStoryConceptSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createPayloadSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    if (!STORY_CONCEPT_ENABLED) throw new Error("Story / Concept submissions are not enabled yet.");

    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole) throw new Error("Only the submitting Creator or Studio may create an Original IP submission");
    assertPermission(actor, "title.create");
     const titleId = randomBytes(16).toString("hex");
    const slug = slugify(data.titleName, titleId);
    const sql = await getSql();

    try {
      return await sql.transaction(async (tx) => {
        await tx`
          insert into bridge_titles (
            id, slug, name, owner_user_id, owner_account_type, status,
            synopsis, language, content_type, owner_organization_id, submission_type
          ) values (
            ${titleId}, ${slug}, ${data.titleName}, ${actor.userId}, ${actor.accountType},
            ${"DRAFT"}, ${data.synopsis}, ${data.language}, ${"OTHER"},
            ${actor.accountType === "studio" ? actor.organizationId ?? null : null},
            ${"story_concept"}
          )
        `;

        await tx`
          insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
          values (${titleId}, null, ${"DRAFT"}, ${actor.userId}, ${"story concept submission received"})
        `;

        const rows = await tx<ConceptRow>`
          insert into bridge_story_concept_submissions (
            title_id, logline, synopsis, treatment_url, screenplay_url,
            genre, estimated_budget_range, target_platforms, curation_status,
            rights_holder_name, rights_basis, rights_basis_details,
            third_party_materials_included, third_party_materials_details,
            rights_declaration_accepted_at, rights_declaration_version
          ) values (
            ${titleId}, ${data.logline}, ${data.synopsis}, ${data.treatmentUrl || null},
            ${data.screenplayUrl || null}, ${data.genre}, ${data.estimatedBudgetRange ?? null},
            ${data.targetPlatforms}, ${"PENDING"}, ${data.rightsHolderName},
            ${data.rightsBasis}, ${data.rightsBasisDetails?.trim() || null},
            ${data.thirdPartyMaterialsIncluded}, ${data.thirdPartyMaterialsDetails?.trim() || null},
            now(), ${"story-concept-rights-v1"}
          )
          returning *
        `;
        const concept = rows[0];
        if (!concept) throw new Error("Story concept create failed");

        await writeAudit({
          actorUserId: actor.userId,
          action: "story_concept.create",
          entityType: "bridge_story_concept_submission",
          entityId: concept.id,
          metadata: { titleId, rightsDeclarationVersion: "story-concept-rights-v1" },
        }, tx);

        return { titleId, concept: mapConcept(concept) };
      });
    } catch (error) {
      migrationHint(error);
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
              ${actor.internalRole === null}
              and ${actor.accountType === "studio"}
              and t.owner_account_type = 'studio'
              and t.owner_organization_id = ${actor.organizationId ?? null}
              and exists (
                select 1 from bridge_organization_memberships m
                where m.organization_id = t.owner_organization_id
                  and m.user_id = ${actor.userId}
                  and m.status = 'active'
              )
            )
          )
        order by c.created_at desc
        limit 100
      `;
      return { concepts: rows.map((row) => ({ ...mapConcept(row), titleName: row.title_name })) };
    } catch (error) {
      migrationHint(error);
    }
  });

const reviewInput = z.object({
  id: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_INFO", "UNDER_REVIEW"]),
  notes: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  if ((value.decision === "REJECTED" || value.decision === "NEEDS_INFO") && !value.notes?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A reason is required for rejection or more information" });
  }
});

export const reviewStoryConceptEditorial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireEditorialReviewer(actor);
    const sql = await getSql();

    return sql.transaction(async (tx) => {
      const locked = await tx<ConceptRow>`
        select * from bridge_story_concept_submissions
        where id = ${data.id}
        for update
      `;
      const current = locked[0];
      if (!current) throw new Error("Story / Concept submission not found");
      if (current.curation_status === "INTRODUCED_TO_BUYERS") throw new Error("Buyer-introduced submissions are read-only for review");
      if (data.decision === "APPROVED" && !hasCompleteRightsDeclaration(current)) {
        throw new Error("A complete accepted author rights declaration is required before Editorial approval");
      }
      if (current.legal_reviewed_by === actor.userId) {
        throw new Error("Editorial and Legal approvals must be completed by different people");
      }

      const rows = await tx<ConceptRow>`
        update bridge_story_concept_submissions
        set editorial_status = ${data.decision},
            editorial_reviewed_by = ${actor.userId},
            editorial_reviewed_at = now(),
            editorial_review_notes = ${data.notes ?? null},
            updated_at = now()
        where id = ${data.id}
        returning *
      `;
      const concept = rows[0];
      if (!concept) throw new Error("Editorial review could not be saved");
      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.editorial_review",
        entityType: "bridge_story_concept_submission",
        entityId: data.id,
        metadata: { decision: data.decision, notesPresent: Boolean(data.notes?.trim()) },
      }, tx);
      return { concept: mapConcept(concept) };
    });
  });

export const reviewStoryConceptLegal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireLegalReviewer(actor);
    const sql = await getSql();

    return sql.transaction(async (tx) => {
      const locked = await tx<ConceptRow>`
        select * from bridge_story_concept_submissions
        where id = ${data.id}
        for update
      `;
      const current = locked[0];
      if (!current) throw new Error("Story / Concept submission not found");
      if (current.curation_status === "INTRODUCED_TO_BUYERS") throw new Error("Buyer-introduced submissions are read-only for review");
      if (data.decision === "APPROVED" && !hasCompleteRightsDeclaration(current)) {
        throw new Error("A complete accepted author rights declaration is required before Legal approval");
      }
      if (current.editorial_reviewed_by === actor.userId) {
        throw new Error("Editorial and Legal approvals must be completed by different people");
      }

      const rows = await tx<ConceptRow>`
        update bridge_story_concept_submissions
        set legal_status = ${data.decision},
            legal_reviewed_by = ${actor.userId},
            legal_reviewed_at = now(),
            legal_review_notes = ${data.notes ?? null},
            updated_at = now()
        where id = ${data.id}
        returning *
      `;
      const concept = rows[0];
      if (!concept) throw new Error("Legal review could not be saved");
      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.legal_review",
        entityType: "bridge_story_concept_submission",
        entityId: data.id,
        metadata: { decision: data.decision, notesPresent: Boolean(data.notes?.trim()) },
      }, tx);
      return { concept: mapConcept(concept) };
    });
  });

export const listPendingStoryConcepts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireCurationQueueAccess(actor);
    const sql = await getSql();
    try {
      const rows = await sql<ConceptRow & { title_name: string; owner_user_id: string }>`
        select c.*, t.name as title_name, t.owner_user_id
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where t.submission_type = 'story_concept'
          and c.curation_status <> 'REJECTED'
        order by c.created_at asc
        limit 200
      `;
      return {
        concepts: rows.map((row) => ({
          ...mapConcept(row),
          titleName: row.title_name,
          ownerUserId: row.owner_user_id,
        })),
      };
    } catch (error) {
      migrationHint(error);
    }
  });

export const updateStoryConceptCuration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    id: z.string().uuid(),
    status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "INTRODUCED_TO_BUYERS"]),
    adminNotes: z.string().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.approve");
    const sql = await getSql();

    try {
      return await sql.transaction(async (tx) => {
        const locked = await tx<ConceptRow>`
          select * from bridge_story_concept_submissions
          where id = ${data.id}
          for update
        `;
        const current = locked[0];
        if (!current) throw new Error("Story / Concept submission not found");

        const from = current.curation_status as CurationStatus;
        const allowed = CURATION_TRANSITIONS[from] ?? [];
        if (!allowed.includes(data.status)) throw new Error(`Invalid curation transition: ${from} → ${data.status}`);

        if (data.status === "APPROVED" && !hasIndependentEditorialAndLegalApproval(current)) {
          throw new Error("Independent Editorial and Legal approvals by different reviewers are required before curation approval");
        }
        if (data.status === "INTRODUCED_TO_BUYERS" && !canIntroduceStoryConceptToBuyers(current)) {
          throw new Error("Independent Editorial and Legal approvals plus fee certification are required before buyer introduction");
        }

        const rows = await tx<ConceptRow>`
          update bridge_story_concept_submissions
          set curation_status = ${data.status},
              admin_notes = case when ${data.adminNotes !== undefined} then ${data.adminNotes ?? null} else admin_notes end,
              updated_at = now(),
              introduced_to_buyers_at = case
                when ${data.status} = 'INTRODUCED_TO_BUYERS' then coalesce(introduced_to_buyers_at, now())
                else introduced_to_buyers_at
              end
          where id = ${data.id}
          returning *
        `;
        const concept = rows[0];
        if (!concept) throw new Error("Story / Concept curation update failed");
        await writeAudit({
          actorUserId: actor.userId,
          action: "story_concept.curation_update",
          entityType: "bridge_story_concept_submission",
          entityId: data.id,
          metadata: { from, status: data.status },
        }, tx);
        return { concept: mapConcept(concept) };
      });
    } catch (error) {
      migrationHint(error);
    }
  });