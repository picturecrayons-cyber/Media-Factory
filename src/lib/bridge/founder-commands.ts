import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

const commandSchema = z.object({ command: z.enum(["pending_titles"]) });

/** Read-only, allowlisted Founder Centre command. Authorization is enforced server-side. */
export const executeFounderCommand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(commandSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin" || !actor.emailVerified) {
      throw new Error("Verified Super Admin access required.");
    }

    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; status: string }>`
      select id, name, status
      from bridge_titles
      where status in ('QC_REVIEW', 'RIGHTS_REVIEW', 'PREPARING', 'UPLOADING')
      order by updated_at desc
      limit 100
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "FOUNDER_COMMAND_EXECUTED",
      entityType: "founder_command",
      entityId: "pending_titles",
      metadata: { command: data.command, resultCount: rows.length, readOnly: true },
    });
    return { command: data.command, executedAt: new DaֻǱ˞