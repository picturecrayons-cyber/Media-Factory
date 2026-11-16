import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertNotDevUser } from "@/lib/bridge/guards";

/**
 * Permanent title deletion is deliberately disabled.
 *
 * The repository does not yet have independently verified schema compatibility,
 * an atomic archive/restore workflow, or a recoverable cross-system OCI deletion
 * protocol. Keep this endpoint fail-closed until those gates are implemented.
 */
export const deleteTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8), confirmation: z.string().min(1).max(160) }))
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    throw new Error(
      "Permanent title deletion is disabled. Use the supported archive/restore workflow; contact an administrator if this title needs correction.",
    );
  });
