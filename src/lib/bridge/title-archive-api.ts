import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";
import { canMutateTitle } from "./rbac";
import { loadTitle } from "./titles";
import { archiveDraftTitle, canArchiveDraftTitle, restoreArchivedDraft } from "./title-archive";

async function mutateDraft(userId: string, id: string, restore: boolean) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (actor.internalRole && actor.internalRole !== "super_admin") {
    throw new Error("Only Super Admin may manage another account's archived drafts.");
  }
  if (!actor.internalRole && !["independent_creator", "studio"].includes(actor.accountType)) {
    throw new Error("Only verified Creator or Studio accounts can manage their own drafts.");
  }
  const title = await loadTitle(id);
  if (!title) throw new Error("Title not found.");
  if (!actor.internalRole && !canMutateTitle(actor, title, "title.update_own", "title.license")) {
    throw new Error("You do not have permission to manage this title.");
  }
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const targetId = restore
      ? await restoreArchivedDraft(tx, actor, title)
      : await archiveDraftTitle(tx, actor, title);
    await writeAudit({
      actorUserId: actor.userId,
      action: restore ? "title.draft_restored" : "title.draft_archived",
      entityType: "bridge_title",
      entityId: targetId,
      metadata: { titleStatus: "DRAFT", globalAdminAction: actor.internalRole === "super_admin" },
    }, tx);
    return { id: targetId };
  });
}

export const listArchivableDraftIds = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole && actor.internalRole !== "super_admin") return { ids: [] as string[] };
    if (!actor.internalRole && !["independent_creator", "studio"].includes(actor.accountType)) return { ids: [] as string[] };
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      select id from bridge_titles
      where status = 'DRAFT' and archived_at is null
        and (
          ${actor.internalRole === "super_admin"}::boolean
          or owner_user_id = ${actor.userId}
          or (
            ${actor.accountType === "studio"}::boolean
            and owner_account_type = 'studio'
            and owner_organization_id = ${actor.organizationId ?? null}
            and exists (
              select 1 from bridge_organization_memberships m
              where m.organization_id = ${actor.organizationId ?? null}
                and m.user_id = ${actor.userId}
                and m.status = 'active'
            )
          )
        )
      order by updated_at desc limit 200
    `;
    const eligible: string[] = [];
    for (const row of rows) {
      const title = await loadTitle(row.id);
      if (title && await canArchiveDraftTitle(sql, actor, title)) eligible.push(row.id);
    }
    return { ids: eligible };
  });

export const archiveDraftTitleAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8).max(160) }))
  .handler(async ({ context, data }) => mutateDraft(context.userId, data.id, false));

export const restoreArchivedDraftAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8).max(160) }))
  .handler(async ({ context, data }) => mutateDraft(context.userId, data.id, true));

export const listMyArchivedDrafts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole && actor.internalRole !== "super_admin") {
      throw new Error("Only Super Admin may view cross-account archived drafts.");
    }
    if (!actor.internalRole && !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Only verified Creator or Studio accounts can view archived drafts.");
    }
    const sql = await getSql();
    const allTenants = actor.internalRole === "super_admin";
    const rows = await sql<{
      id: string; name: string; language: string; year: number | null;
      submission_type: string; archived_at: string | Date;
    }>`
      select t.id, t.name, t.language, t.year, t.submission_type, t.archived_at
      from bridge_titles t
      where t.status = 'DRAFT'
        and t.archived_at is not null
        and (
          ${allTenants}::boolean
          or t.owner_user_id = ${actor.userId}
          or (
            ${actor.accountType === "studio"}::boolean
            and t.owner_account_type = 'studio'
            and t.owner_organization_id = ${actor.organizationId ?? null}
            and exists (
              select 1 from bridge_organization_memberships m
              where m.organization_id = ${actor.organizationId ?? null}
                and m.user_id = ${actor.userId}
                and m.status = 'active'
            )
          )
        )
      order by t.archived_at desc
      limit 200
    `;
    return {
      titles: rows.map((row) => ({
        ...row,
        archivedAt: row.archived_at instanceof Date ? row.archived_at.toISOString() : String(row.archived_at),
      })),
    };
  });
