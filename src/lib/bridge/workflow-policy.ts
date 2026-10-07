import { z } from "zod";

export const loopLicenseInput = z
  .object({
    titleId: z.string().min(8),
    territories: z.array(z.string().trim().min(2).max(32)).length(1),
    languages: z.array(z.string().trim().min(2).max(40)).min(1).max(20),
    windowStart: z.string().datetime(),
    windowEnd: z.string().datetime(),
    exclusivity: z.enum(["EXCLUSIVE", "NON_EXCLUSIVE"]),
    agreementReference: z.string().trim().min(8).max(500),
    ownershipReference: z.string().trim().min(8).max(500),
    rightsOwnerSharePct: z.number().int().min(0).max(100),
    distributorSharePct: z.number().int().min(0).max(100),
  })
  .superRefine((v, ctx) => {
    if (v.territories[0] !== "WORLDWIDE")
      ctx.addIssue({ code: "custom", message: "Loop currently supports WORLDWIDE TVOD only" });
    if (new Date(v.windowEnd) <= new Date(v.windowStart))
      ctx.addIssue({ code: "custom", message: "License end must follow start" });
    if (v.rightsOwnerSharePct + v.distributorSharePct !== 100)
      ctx.addIssue({ code: "custom", message: "Revenue shares must total 100%" });
  });

export function publicationIsActive(
  status: string | undefined,
  start: string | null,
  end: string | null,
  now = Date.now(),
) {
  return (
    ["authorized", "live"].includes((status ?? "").toLowerCase()) &&
    Boolean(start && end) &&
    new Date(start ?? "").getTime() <= now &&
    new Date(end ?? "").getTime() > now
  );
}

export function producerSharePaise(amount: number, sharePct: number) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isInteger(sharePct) ||
    sharePct < 0 ||
    sharePct > 100
  )
    throw new Error("Invalid revenue calculation");
  return Number((BigInt(amount) * BigInt(sharePct)) / 100n);
}
