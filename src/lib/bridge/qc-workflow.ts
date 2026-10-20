import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission, hasStaffPermission } from "./rbac";
import { loadTitle, recordTransition } from "./titles";
import { writeAudit } from "./audit";
import {
  type QcPrerequisites,
  evaluateQcPrerequisites,
} from "./admin-workflow-policy";

export type { QcPrerequisites };
export { evaluateQcPrerequisites };

export async function checkQcPrerequisites(titleId: string): Promise<QcPrerequisites> {
  const title = await loadTitle(titleId);
  if (!title) throw new Error("Title not found.");

  const sql = await getSql();
  const assets = await sql<{
    kind: string;
    byte_size: number | null;
    s3_key: string | null;
    verified: boolean;
  }>`
    select kind, byte_size, s3_key, verified
    from bridge_assets
    where title_id = ${titleId} and byte_size > 0
  `;

  return evaluateQcPrerequisites(title, assets);
}

export const getQcPrerequisites = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found.");

    return checkQcPrerequisites(data.titleId);
  });

export const proceedToQc = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found.");

    // Enforce authorization: Super admin, admin, or title owner with advance upload permission
    const isOwner = title.ownerUserId === actor.userId;
    const isStaff = Boolean(actor.internalRole && hasStaffPermission(actor, "title.advance_upload"));
    if (!isOwner && !isStaff) {
      throw new Error("Forbidden: Only an authorized administrator or the title owner can proceed to QC.");
    }
    assertPermission(actor, "title.advance_upload");

    // Idempotency: If already in QC_REVIEW, return cleanly without duplicate state mutation
    if (title.status === "QC_REVIEW") {
      return {
        ok: true,
        alreadyInQc: true,
        message: "Title is already in QC Review queue.",
        status: "QC_REVIEW",
        qcWorkspaceUrl: "/internal?desk=qc",
      };
    }

    // Validate prerequisites
    const prereqs = await checkQcPrerequisites(data.titleId);
    if (!prereqs.canProceed) {
      throw new Error(`Cannot proceed to QC. Blockers: ${prereqs.blockers.join(" · ")}`);
    }

    const sql = await getSql();

    return sql.transaction(async (tx) => {
      // Lock title row to prevent concurrent transitions
      const [locked] = await tx<{ status: string }>`
        select status from bridge_titles where id = ${data.titleId} for update
      `;
      if (!locked) throw new Error("Title not found.");
      if (locked.status === "QC_REVIEW") {
        return {
          ok: true,
          alreadyInQc: true,
          message: "Title is already in QC Review queue.",
          status: "QC_REVIEW",
          qcWorkspaceUrl: "/internal?desk=qc",
        };
      }

      // If status is DRAFT or UPLOADING, ensure master and poster keys are synchronized on title
      await tx`
        update bridge_titles
        set
          status = 'QC_REVIEW',
          master_key = coalesce(master_key, ${prereqs.assets.masterKey}),
          poster_key = coalesce(poster_key, ${prereqs.assets.posterKey}),
          updated_at = now()
        where id = ${data.titleId}
      `;

      // Record state transition
      await recordTransition(
        {
          titleId: data.titleId,
          from: locked.status as any,
          to: "QC_REVIEW",
          actorUserId: actor.userId,
          note: data.note || "Proceeded to QC review with verified assets and metadata",
        },
        tx,
      );

      // Audit log
      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "title.proceed_to_qc",
          entityType: "bridge_title",
          entityId: data.titleId,
          metadata: {
            fromStatus: locked.status,
            toStatus: "QC_REVIEW",
            masterKey: prereqs.assets.masterKey,
            posterKey: prereqs.assets.posterKey,
          },
        },
        tx,
      );

      return {
        ok: true,
        alreadyInQc: false,
        status: "QC_REVIEW",
        message: "Title successfully advanced to QC Review.",
        qcWorkspaceUrl: "/internal?desk=qc",
      };
    });
  });
