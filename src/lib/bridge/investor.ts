import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { listInvestorInvestments } from "./investor-query";

export const getOwnInvestorInvestments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "investor") throw new Error("Forbidden");
    return listInvestorInvestments(await getSql(), actor.userId);
  });
