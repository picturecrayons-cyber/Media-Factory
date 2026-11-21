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
    if (actor.accountType === "studio") {
      if (!title.ownerOrganizationId) throw new Error("Studio title organization scope is missing; Bridge staff must reconcile it.");
      const memberships = await sql<{ allowed: boolean }>`
        select exists (
          select 1 from bridge_organization_memberships
          where organization_id = ${title.ownerOrganizationId}::uuid
            and user_id = ${actor.userId}
            and status = 'active'
        ) as allowed
      `;
      if (!memberships[0]?.allowed) throw new Error("Active Studio membership is required to delete this draft.");
    }

    return sql.transaction(async (tx) => {
      const rows = await tx<{
        id: string; owner_user_id: string; owner_account_type: string; owner_organization_id: string | null;
        status: string; creator_submission_status: "DRAFT" | "SUBMITTED";
        deleted_at: string | Date | null; submission_type: string | null;
      }>`
        select id, owner_user_id, owner_account_type, owner_organization_id,
          status, creator_submission_status, deleted_at, submission_type
        from bridge_titles where id = ${data.id} for update
      `;
      const locked = rows[0];
      if (!locked || locked.owner_user_id !== title.ownerUserId ||
          locked.owner_account_type !== actor.accountType ||
          (locked.owner_organization_id ?? null) !== (title.ownerOrganizationId ?? null)) {
        throw new Error("Title not found");
      }
      if (actor.accountType === "studio") {
        if (!locked.owner_organization_id) throw new Error("Studio title organization scope is missing; Bridge staff must reconcile it.");
        const activeMembership = await tx<{ allowed: boolean }>`
          select exists (
            select 1 from bridge_organization_memberships
            where organization_id = ${locked.owner_organization_id}::uuid
              and user_id = ${actor.userId}
              and status = 'active'
          ) as allowed
        `;
        if (!activeMembership[0]?.allowed) throw new Error("Active Studio membership is required to delete this draft.");
      }
      const assetRows = await tx<{ count: number }>`
        select count(*)::int as count from bridge_assets where title_id = ${locked.id}
      `;
      const rightsRows = await tx<{ count: number }>`
        select count(*)::int as count from bridge_rights_grants where title_id = ${locked.id}
      `;
      const legalRows = await tx<{ count: number }>`
        select count(*)::int as count from bridge_legal_cases where title_id = ${locked.id}
      `;
      const documentLinkTable = await tx<{ exists: boolean }>`
        select to_regclass('public.bridge_title_document_links') is not null as exists
      `;
      const documentRows = documentLinkTable[0]?.exists
        ? await tx<{ count: number }>`
            select count(*)::int as count from bridge_title_document_links where title_id = ${locked.id}
          `
        : [{ count: 0 }];
      const productionAssetTable = await tx<{ exists: boolean }>`
        select to_regclass('public.bridge_production_assets') is not null as exists
      `;
      const productionRows = productionAssetTable[0]?.exists
        ? await tx<{ count: number }>`
            select count(*)::int as count from bridge_production_assets where title_id = ${locked.id}
          `
        : [{ count: 0 }];
      if (Number(rightsRows[0]?.count ?? 0) > 0 ||
          Number(legalRows[0]?.count ?? 0) > 0 ||
          Number(documentRows[0]?.count ?? 0) > 0 ||
          Number(productionRows[0]?.count ?? 0) > 0) {
        throw new Error("This draft already has rights or legal evidence linked. Use the authorized withdrawal/reconciliation workflow instead of archiving it.");
      }
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
