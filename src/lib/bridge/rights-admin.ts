import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { assertPermission, canReadTitle } from "./rbac";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { summarizeEvidenceStatus, type EvidenceReviewStatus } from "./rights-admin-policy";
import {
  RIGHTS_AVAILABILITY_STATUSES,
  RIGHTS_EXCLUSIVITY,
  RIGHTS_LANGUAGE_SCOPES,
  RIGHTS_MONETISATION_MODELS,
} from "./rights-taxonomy";

const scopeInput = z.object({
  code: z.string().trim().min(2).max(16),
  label: z.string().trim().min(2).max(80),
  scopeType: z.enum(["COUNTRY", "REGION", "WORLDWIDE", "CUSTOM"]).default("COUNTRY"),
});

const languageInput = z.object({
  code: z.string().trim().min(2).max(16),
  label: z.string().trim().min(2).max(80),
  scope: z.enum(RIGHTS_LANGUAGE_SCOPES),
});

const evidenceInput = z.object({
  type: z.enum(["CONTRACT", "ASSIGNMENT", "CLEARANCE", "AMENDMENT", "EMAIL_CONFIRMATION", "LEGAL_REVIEW", "OTHER"]),
  storageReference: z.string().trim().max(500).optional(),
  documentHash: z.string().trim().max(160).optional(),
  sourceRightsholder: z.string().trim().max(160).optional(),
  effectiveDate: z.string().date().nullable().optional(),
  expiryDate: z.string().date().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});

const createInput = z.object({
  titleId: z.string().min(8).max(160),
  categoryCode: z.string().trim().min(2).max(80),
  territories: z.array(scopeInput).min(1).max(100),
  languages: z.array(languageInput).min(1).max(100),
  availabilityStatus: z.enum(RIGHTS_AVAILABILITY_STATUSES).default("UNKNOWN"),
  exclusivity: z.enum(RIGHTS_EXCLUSIVITY).default("UNSPECIFIED"),
  monetisationModels: z.array(z.enum(RIGHTS_MONETISATION_MODELS)).max(20).default([]),
  transmissionModes: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  premiereWindow: z.string().trim().max(160).nullable().optional(),
  permittedPlays: z.number().int().min(0).nullable().optional(),
  restrictions: z.record(z.string(), z.unknown()).default({}),
  buyerVisibleSummary: z.string().trim().max(1000).optional(),
  internalNotes: z.string().trim().max(2000).optional(),
  evidence: z.array(evidenceInput).min(1).max(30),
}).superRefine((data, ctx) => {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "Rights end date must not precede start date" });
  }
  for (const item of data.evidence) {
    if (item.effectiveDate && item.expiryDate && item.expiryDate < item.effectiveDate) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "Evidence expiry must not precede its effective date" });
    }
  }
});

const evidenceReviewInput = z.object({
  evidenceId: z.string().uuid(),
  reviewStatus: z.enum(["VERIFIED", "REJECTED", "DISPUTED", "SUPERSEDED"]),
  reviewNote: z.string().trim().max(1000).optional(),
});

export const listRightsCategories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const sql = await getSql();
    const categories = await sql`
      select code, family, label, description, buyer_types, sort_order
      from public.bridge_rights_categories
      where active = true
      order by sort_order, label
    `;
    return { categories };
  });

export const listTitleRights = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8).max(160) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const sql = await getSql();
    const rights = await sql`
      select r.id, r.title_id, r.category_code, c.family, c.label as category_label,
             r.evidence_status, r.availability_status, r.exclusivity, r.monetisation_models,
             r.transmission_modes, r.start_date, r.end_date, r.premiere_window,
             r.permitted_plays, r.restrictions, r.buyer_visible_summary, r.internal_notes,
             r.reviewed_by, r.reviewed_at, r.created_at, r.updated_at
      from public.bridge_title_rights r
      join public.bridge_rights_categories c on c.code = r.category_code
      where r.title_id = ${data.titleId}
      order by c.sort_order, c.label, r.created_at desc
    `;
    const ids = rights.map((right: { id: string }) => right.id);
    if (!ids.length) return { rights: [] };
    const [territories, languages, evidence] = await Promise.all([
      sql`select title_right_id, territory_code, territory_label, scope_type
          from public.bridge_title_right_territories where title_right_id = any(${ids}::uuid[])`,
      sql`select title_right_id, language_code, language_label, language_scope
          from public.bridge_title_right_languages where title_right_id = any(${ids}::uuid[])`,
      sql`select id, title_right_id, evidence_type, document_hash, source_rightsholder,
                 effective_date, expiry_date, review_status, reviewed_by, reviewed_at, confidential
          from public.bridge_rights_evidence where title_right_id = any(${ids}::uuid[])
          order by created_at desc`,
    ]);
    return {
      rights: rights.map((right: { id: string }) => ({
        ...right,
        territories: territories.filter((item: { title_right_id: string }) => item.title_right_id === right.id),
        languages: languages.filter((item: { title_right_id: string }) => item.title_right_id === right.id),
        evidence: evidence.filter((item: { title_right_id: string }) => item.title_right_id === right.id),
      })),
    };
  });

export const createTitleRight = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const sql = await getSql();

    const category = await sql`
      select code from public.bridge_rights_categories where code = ${data.categoryCode} and active = true limit 1
    `;
    if (!category.length) throw new Error("RIGHTS_CATEGORY_NOT_ACTIVE");
    if (data.startDate && data.endDate && data.endDate < data.startDate) throw new Error("INVALID_RIGHTS_WINDOW");

    const rightId = crypto.randomUUID();
    await sql.transaction(async (tx) => {
      await tx`
        insert into public.bridge_title_rights (
          id, title_id, category_code, evidence_status, availability_status, exclusivity,
          monetisation_models, transmission_modes, start_date, end_date, premiere_window,
          permitted_plays, restrictions, buyer_visible_summary, internal_notes, created_by
        ) values (
          ${rightId}, ${data.titleId}, ${data.categoryCode}, 'PENDING_REVIEW',
          ${data.availabilityStatus}, ${data.exclusivity}, ${data.monetisationModels},
          ${data.transmissionModes}, ${data.startDate ?? null}, ${data.endDate ?? null},
          ${data.premiereWindow ?? null}, ${data.permittedPlays ?? null},
          ${JSON.stringify(data.restrictions)}::jsonb, ${data.buyerVisibleSummary ?? null},
          ${data.internalNotes ?? null}, ${actor.userId}
        )
      `;
      for (const territory of data.territories) {
        await tx`
          insert into public.bridge_title_right_territories
            (title_right_id, territory_code, territory_label, scope_type)
          values (${rightId}, ${territory.code.toUpperCase()}, ${territory.label}, ${territory.scopeType})
        `;
      }
      for (const language of data.languages) {
        await tx`
          insert into public.bridge_title_right_languages
            (title_right_id, language_code, language_label, language_scope)
          values (${rightId}, ${language.code.toUpperCase()}, ${language.label}, ${language.scope})
        `;
      }
      for (const item of data.evidence) {
        await tx`
          insert into public.bridge_rights_evidence (
            title_right_id, evidence_type, storage_reference, document_hash, source_rightsholder,
            effective_date, expiry_date, review_status, confidential, notes, created_by
          ) values (
            ${rightId}, ${item.type}, ${item.storageReference ?? null}, ${item.documentHash ?? null},
            ${item.sourceRightsholder ?? null}, ${item.effectiveDate ?? null}, ${item.expiryDate ?? null},
            'PENDING_REVIEW', true, ${item.notes ?? null}, ${actor.userId}
          )
        `;
      }
    });

    await writeAudit({
      actorUserId: actor.userId,
      action: "rights.title_right_created",
      entityType: "bridge_title_right",
      entityId: rightId,
      metadata: { titleId: data.titleId, categoryCode: data.categoryCode, evidenceCount: data.evidence.length },
    });
    return { rightId, evidenceStatus: "PENDING_REVIEW" as const, availabilityStatus: data.availabilityStatus };
  });

export const reviewRightsEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(evidenceReviewInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const sql = await getSql();
    const rows = await sql`
      select e.id, e.title_right_id, r.title_id
      from public.bridge_rights_evidence e
      join public.bridge_title_rights r on r.id = e.title_right_id
      where e.id = ${data.evidenceId}::uuid
      limit 1
    `;
    const row = rows[0] as { id: string; title_right_id: string; title_id: string } | undefined;
    if (!row) throw new Error("Evidence not found");
    const title = await loadTitle(row.title_id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");

    await sql.transaction(async (tx) => {
      await tx`
        update public.bridge_rights_evidence
        set review_status = ${data.reviewStatus}, reviewed_by = ${actor.userId}, reviewed_at = now()
        where id = ${data.evidenceId}::uuid
      `;
      const evidenceRows = await tx`
        select review_status from public.bridge_rights_evidence
        where title_right_id = ${row.title_right_id}::uuid
      `;
      const nextStatus = summarizeEvidenceStatus(
        evidenceRows.map((item: { review_status: EvidenceReviewStatus }) => item.review_status),
      );
      await tx`
        update public.bridge_title_rights
        set evidence_status = ${nextStatus}, reviewed_by = ${actor.userId}, reviewed_at = now(), updated_at = now()
        where id = ${row.title_right_id}::uuid
      `;
    });

    await writeAudit({
      actorUserId: actor.userId,
      action: "rights.evidence_reviewed",
      entityType: "bridge_rights_evidence",
      entityId: data.evidenceId,
      metadata: { titleRightId: row.title_right_id, reviewStatus: data.reviewStatus, reviewNote: data.reviewNote ?? "" },
    });
    return { evidenceId: data.evidenceId, reviewStatus: data.reviewStatus };
  });
