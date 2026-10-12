import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertNotDevUser } from "./guards";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { diagnoseOciAuthentication } from "./oci-object-storage.server";

/** Runs a non-mutating OCI auth/access check for verified studio users. */
export const runOciReadOnlyDiagnostic = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "asset.sign_upload");
    return diagnoseOciAuthentication();
  });
