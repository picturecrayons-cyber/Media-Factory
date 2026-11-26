import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

const productionShootSchema = z.object({
  productionNo: z.string().trim().min(2).max(80),
  productionTitle: z.string().trim().min(2).max(200),
  productionFormat: z.enum(["FEATURE","SERIES","SHORT","DOCUMENTARY","ADVERTISEMENT","OTHER"]),
  developmentStage: z.enum(["DEVELOPMENT","PRE_PRODUCTION","PRINCIPAL_PHOTOGRAPHY","POST_PRODUCTION","ON_HOLD","COMPLETED"]),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
  shootDays: z.number().int().min(1).max(1000).optional(),
  primaryLocation: z.string().trim().max(240).optional(),
  producerName: z.string().trim().max(160).optional(),
  directorName: z.string().trim().max(160).optional(),
  crew: z.array(z.object({ role: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(160) })).max(100),
  shootProgress: z.enum(["NOT_STARTED","IN_PROGRESS","WRAPPED","ON_HOLD"]),
  mediaHandoverStatus: z.enum(["NOT_STARTED","IN_PROGRESS","PARTIAL","COMPLETE","QC_PENDING"]),
  productionNotes: z.string().trim().max(4000).optional(),
}).superRefine((data, ctx) => {
  if (data.plannedStartDate && data.plannedEndDate && data.plannedEndDate < data.plannedStartDate) {
    ctx.addIssue({ code: "custom", path: ["plannedEndDate"], message: "End date must not be before start date" });
  }
});

function slugify(value: string, id: string) {
  return `${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "production"}-${id.slice(0, 6)}`;
}

/** Creates a Production Shoot owner submission. It does not create a finished-film QC case or grant rights. */
export const createProductionShootSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(productionShootSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!["studio", "independent_creator"].includes(actor.accountType)) {
      throw new Error("Only Studio and Creator accounts can submit a production shoot");
    }
    assertPermission(actor, "title.create");

    const titleId = randomBytes(16).toString("hex");
    const submissionId = randomBytes(16).toString("hex");
    const sql = await getSql();
    const details = {
      submissionKind: "production_shoot",
      productionNo: data.productionNo,
      productionTitle: data.productionTitle,
      productionFormat: data.productionFormat,
      developmentStage: data.developmentStage,
      plannedStartDate: data.plannedStartDate || null,
      plannedEndDate: data.plannedEndDate || null,
      shootDays: data.shootDays ?? null,
      primaryLocation: data.primaryLocation || null,
      producerName: data.producerName || null,
      directorName: data.directorName || null,
      productionNotes: data.productionNotes || null,
    };

    await sql.transaction(async (tx) => {
      await tx`
        insert into bridge_titles (
          id, slug, name, owner_user_id, owner_account_type, owner_organization_id,
          status, synopsis, language, content_type, submission_type
        ) values (
          ${titleId}, ${slugify(data.productionTitle, titleId)}, ${data.productionTitle},
          ${actor.userId}, ${actor.accountType},
          ${actor.accountType === "studio" ? actor.organizationId ?? null : null},
          'DRAFT', '', 'Malayalam', ${data.productionFormat}, 'production_shoot'
        )
      `;

      await tx`
        insert into bridge_production_shoots (
          title_id, production_no, production_title, production_format, development_stage,
          planned_start_date, planned_end_date, shoot_days, primary_location,
          producer_name, director_name, production_notes, created_by, updated_by
        ) values (
          ${titleId}, ${data.productionNo}, ${data.productionTitle}, ${data.productionFormat},
          ${data.developmentStage}, ${data.plannedStartDate || null}, ${data.plannedEndDate || null},
          ${data.shootDays ?? null}, ${data.primaryLocation || null}, ${data.producerName || null},
          ${data.directorName || null}, ${data.productionNotes || null}, ${actor.userId}, ${actor.userId}
        )
      `;

      await tx`
        insert into bridge_title_owner_submissions (
          id, title_id, owner_user_id, owner_organization_id, details,
          submission_status, submitted_at, submitted_by, updated_by
        ) values (
          ${submissionId}, ${titleId}, ${actor.userId},
          ${actor.accountType === "studio" ? actor.organizationId ?? null : null},
          ${JSON.stringify(details)}::jsonb, 'SUBMITTED', now(), ${actor.userId}, ${actor.userId}
        )
      `;

      await tx`
        insert into bridge_owner_submission_events (
          title_id, submission_kind, action, from_status, to_status, actor_user_id, reason
        ) values (
          ${titleId}, 'production_shoot', 'SUBMITTED', 'DRAFT', 'SUBMITTED',
          ${actor.userId}, 'Production Shoot submitted by owner'
        )
      `;

      await tx`
        insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
        values (${titleId}, null, 'DRAFT', ${actor.userId}, 'Production Shoot owner submission')
      `;

      await writeAudit({
        actorUserId: actor.userId,
        action: "production_shoot.submitted",
        entityType: "bridge_title",
        entityId: titleId,
        metadata: { submissionId, productionNo: data.productionNo, submissionStatus: "SUBMITTED" },
      }, tx);
    });

    return { titleId, submissionStatus: "SUBMITTED" as const, titleStatus: "DRAFT" as const };
  });
