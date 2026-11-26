import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";

/**
 * Production Shoot is an internal Studio workflow, never an Owner Submission.
 * Creation remains closed until the confirmed-project activation workflow is implemented.
 * This fail-closed action intentionally creates no title, submission, production or audit rows.
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
      "Production Shoot creation is not enabled yet. It requires a formally confirmed project and the internal Studio Production workspace."
    );
  });
