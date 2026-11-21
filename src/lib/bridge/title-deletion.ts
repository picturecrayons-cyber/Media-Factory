import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { canMutateTitle, assertPermission } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertCreatorTitleCanBeSoftDeleted } from "./creator-title-lifecycle";

export const deleteTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    id: z.string().min(8),
    confirmation: z.literal("DELETE DRAFT"),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Only the owning Creator or Studio account can delete a draft.");
    }
    assertPermission(actor, "title.update_own");
    const title = await loadTitle(data.id);
    if (!title || title.ownerAccountType !== actor.accountType ||
        !canMutateTitle(actor, title, "title.update_own", "title.license")) {
      throw new Error("Title not found");
    }

    const sql = await getSql();
    if (actor.accountType === "studio" && title.ownerOrganizationId) {
      const memberships = await sql<{ allowed: boolean }>`
        select exists (
          select 1 from bridge_organization_memberships
          where organization_id = ${title.ownerOrganizationId}::uuid
            and user_id = ${actor.userId}
            and status = 'active'
        ) as allowed
      `;
      if (!memberships[0]?.allowed && title.ownerUserId !== actor.userId) {
        throw new Error("Active Studio membership is required to delete this draft.");
      }
    }

    return sql.transaction(async (tx) => {
      const rows = await tx<{
        id: string; status: string; creator_submission_status: "DRAFT" | "SUBMITTED";
        deleted_at: string | Date | null; submission_type: string | null;
      }>`
        select id, status, creator_submission_status, deleted_at, submission_type
        from bridge_titles where id = ${data.id} for update
      `;
      const locked = rows[0];
      if (!locked) throw new Error("Title not found");
      const assetRows = await tx<{ count: number }>`
        select count(*)::int as count from bridge_assets where title_id = ${locked.id}
      `;
      assertCreatorTitleCanBeSoftDeleted({
        status: locked.status as "DRAFT",
        submissionStatus: locked.creator_submission_status,
        deletedAt: locked.deleted_at,
        submissionType: locked.submission_type,
      }, Number(assetRows[0]?.count ?? 0) > 0);

      await tx`
        update bridge_titles
        set deleted_at = now(),
            deleted_by = ${actor.userId},
            deleted_reason = 'Creator-requested draft archive',
            updated_at = now()
        where id = ${locked.id} and deleted_at is null
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "title.draft_soft_delete",
        entityType: "bridge_title",
        entityId: locked.id,
        metadata: { deletionMode: "SOFT_ARCHIVE", storageObjectsDeleted: false },
      }, tx);
      return { titleId: locked.id, archived: true as const, deletionMode: "SOFT_ARCHIVE" as const };
    });
  });
