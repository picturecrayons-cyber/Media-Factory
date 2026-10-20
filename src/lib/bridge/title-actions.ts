import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { hasPermission } from "./rbac";
import { loadTitle, recordTransition } from "./titles";
import { writeAudit } from "./audit";

export const archiveTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      reason: z.string().max(500).optional(),
      confirmText: z.literal("ARCHIVE"),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found.");

    // Permission check: Super admin or title owner
    const isOwner = title.ownerUserId === actor.userId && hasPermission(actor, "title.update_own");
    const isSuperAdmin = actor.internalRole === "super_admin";
    if (!isOwner && !isSuperAdmin) {
      throw new Error("Forbidden: Only an authorized Super Admin or the title owner can archive a title.");
    }

    const sql = await getSql();

    // Safety checks: Protect titles with live dependencies
    if (["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status)) {
      throw new Error(
        `Cannot archive title: Status is ${title.status}. Titles with active buyer availability cannot be archived.`,
      );
    }

    const [publications, buyers, deliveries] = await Promise.all([
      sql<{ id: string; authorization_status: string }>`
        select id, authorization_status from bridge_loop_publications
        where bridge_title_id = ${title.id} and authorization_status in ('authorized', 'live')
        limit 1
      `,
      sql<{ id: string }>`
        select id from bridge_buyer_title_access
        where title_id = ${title.id}
        limit 1
      `,
      sql<{ id: string }>`
        select id from bridge_destination_packages
        where title_id = ${title.id} and readiness_state in ('READY', 'DELIVERED')
        limit 1
      `,
    ]);

    if (publications.length > 0) {
      throw new Error("Cannot archive title: An active Crayons Loop publication exists. Revoke distribution first.");
    }

    if (buyers.length > 0) {
      throw new Error("Cannot archive title: Active buyer entitlements or access records exist.");
    }

    if (deliveries.length > 0) {
      throw new Error("Cannot archive title: Active or delivered destination packages exist.");
    }

    return sql.transaction(async (tx) => {
      const [locked] = await tx<{ status: string }>`
        select status from bridge_titles where id = ${data.titleId} for update
      `;
      if (!locked) throw new Error("Title not found.");

      const previousStatus = locked.status;
      const note = `Soft-archived by ${actor.userId}: ${data.reason || "Administrative archival"}`;

      await tx`
        update bridge_titles
        set status = 'DRAFT', updated_at = now()
        where id = ${data.titleId}
      `;

      await recordTransition(
        {
          titleId: data.titleId,
          from: previousStatus as any,
          to: "DRAFT",
          actorUserId: actor.userId,
          note,
        },
        tx,
      );

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "title.archive",
          entityType: "bridge_title",
          entityId: data.titleId,
          metadata: {
            fromStatus: previousStatus,
            toStatus: "DRAFT",
            reason: data.reason || "Administrative archival",
          },
        },
        tx,
      );

      return {
        ok: true,
        status: "DRAFT",
        message: "Title successfully archived into DRAFT state.",
      };
    });
  });
