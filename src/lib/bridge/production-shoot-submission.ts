import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { canMutateTitle } from "./rbac";
import { writeAudit } from "./audit";

/**
 * Production Shoot is an internal Studio workflow, never an Owner Submission.
 * Creation stays fail-closed until a formally confirmed project can be
 * independently verified and activated by Super Admin.
 */
export const createProductionShootSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "studio" || actor.internalRole) {
      throw new Error("Studio account access required");
    }
    throw new Error(
      "Production activation is not available until a confirmed-project record and Super Admin authorization are verified."
    );
  });

const productionUpdateSchema = z.object({
  titleId: z.string().min(8),
  update: z.string().trim().min(5).max(2000),
  shootProgress: z.enum(["NOT_STARTED", "IN_PROGRESS", "WRAPPED", "ON_HOLD"]).optional(),
  mediaHandoverStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "PARTIAL", "COMPLETE", "QC_PENDING"]).optional(),
  developmentStage: z.enum(["DEVELOPMENT", "PRE_PRODUCTION", "PRINCIPAL_PHOTOGRAPHY", "POST_PRODUCTION", "ON_HOLD", "COMPLETED"]).optional(),
  plannedStartDate: z.string().date().nullable().optional(),
  plannedEndDate: z.string().date().nullable().optional(),
  shootDays: z.number().int().min(1).max(1000).nullable().optional(),
  primaryLocation: z.string().trim().max(240).nullable().optional(),
});

/**
 * Creator and Studio may submit progress updates only against an already
 * activated production record. Creator updates cannot change the Studio's
 * schedule or development stage. No title/QC/Rights/Legal state is advanced.
 */
export const submitProductionUpdate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(productionUpdateSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Creator or Studio account required");
    }
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const titles = await tx<{
        id: string; owner_user_id: string; owner_account_type: string;
        owner_organization_id: string | null; status: string;
      }>`
        select id, owner_user_id, owner_account_type, owner_organization_id, status
        from bridge_titles where id = ${data.titleId} for update
      `;
      const title = titles[0];
      if (!title || !canMutateTitle(actor, {
        ownerUserId: title.owner_user_id,
        ownerAccountType: title.owner_account_type as "studio" | "independent_creator",
        ownerOrganizationId: title.owner_organization_id,
      }, "title.update_own", "title.license")) throw new Error("Not found");

      const records = await tx<{ title_id: string }>`
        select title_id from bridge_production_shoots where title_id = ${data.titleId} for update
      `;
      if (!records[0]) {
        throw new Error("No activated Production workspace exists for this title. Ask Super Admin to verify formal project confirmation and activate it.");
      }

      const studioEditor = actor.accountType === "studio";
      if (!studioEditor && (
        data.developmentStage !== undefined ||
        data.plannedStartDate !== undefined ||
        data.plannedEndDate !== undefined ||
        data.shootDays !== undefined ||
        data.primaryLocation !== undefined
      )) throw new Error("Creator updates are limited to shoot progress and media handover. Studio operations manage schedule and production details.");

      if (data.plannedStartDate && data.plannedEndDate && data.plannedEndDate < data.plannedStartDate) {
        throw new Error("Planned end date must be on or after the planned start date.");
      }

      await tx`
        update bridge_production_shoots set
          shoot_progress = coalesce(${data.shootProgress ?? null}, shoot_progress),
          media_handover_status = coalesce(${data.mediaHandoverStatus ?? null}, media_handover_status),
          development_stage = case when ${studioEditor} then coalesce(${data.developmentStage ?? null}, development_stage) else development_stage end,
          planned_start_date = case when ${studioEditor} and ${data.plannedStartDate !== undefined} then ${data.plannedStartDate ?? null}::date else planned_start_date end,
          planned_end_date = case when ${studioEditor} and ${data.plannedEndDate !== undefined} then ${data.plannedEndDate ?? null}::date else planned_end_date end,
          shoot_days = case when ${studioEditor} and ${data.shootDays !== undefined} then ${data.shootDays ?? null} else shoot_days end,
          primary_location = case when ${studioEditor} and ${data.primaryLocation !== undefined} then ${data.primaryLocation ?? null} else primary_location end,
          production_notes = ${data.update},
          updated_by = ${actor.userId},
          updated_at = now()
        where title_id = ${data.titleId}
      `;
      await tx`
        insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
        values (${data.titleId}, ${title.status}, ${title.status}, ${actor.userId},
          ${"Production update submitted: " + data.update})
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "production.update_submitted",
        entityType: "bridge_production_shoot",
        entityId: data.titleId,
        metadata: {
          accountType: actor.accountType,
          shootProgress: data.shootProgress ?? null,
          mediaHandoverStatus: data.mediaHandoverStatus ?? null,
          studioScheduleFieldsChanged: studioEditor && [
            data.developmentStage, data.plannedStartDate, data.plannedEndDate,
            data.shootDays, data.primaryLocation,
          ].some(value => value !== undefined),
        },
      }, tx);
      return { titleId: data.titleId, recorded: true };
    });
  });
