import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { rejectPermanentTitleDeletion } from "./title-deletion-policy";

export const deleteTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8), confirmation: z.string().min(1).max(160) }))
  .handler(async () => {
    // Keep the public server-function contract stable, but fail closed before
    // any database lookup, audit write, or OCI object operation can occur.
    rejectPermanentTitleDeletion();
  });
