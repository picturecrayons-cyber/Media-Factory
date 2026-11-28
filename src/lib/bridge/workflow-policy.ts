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

export type LoopLicenseReviewGrant = {
  territories?: string[] | null;
  languages?: string[] | null;
  media?: string[] | null;
  window_start?: string | Date | null;
  window_end?: string | Date | null;
  exclusivity?: string | null;
  evidence?: Array<{
    agreementReference?: string;
    ownershipReference?: string;
    commercialTerms?: {
      rightsOwnerSharePct?: number;
      distributorSharePct?: number;
    };
  }> | null;
};

export function loopLicenseReviewBlockers(
  grant: LoopLicenseReviewGrant,
  now = Date.now(),
): string[] {
  const blockers: string[] = [];
  if (grant.territories?.length !== 1 || grant.territories[0] !== "WORLDWIDE")
    blockers.push("WORLDWIDE territory is required.");
  if (!grant.languages?.length)
    blockers.push("At least one licensed language is required.");
  if (!grant.media?.includes("CRAYONS_LOOP") || !grant.media?.includes("TVOD"))
    blockers.push("Crayons LOOP TVOD media scope is missing.");
  if (grant.exclusivity !== "NON_EXCLUSIVE")
    blockers.push("NON-EXCLUSIVE terms must be recorded.");

  const start = grant.window_start ? new Date(grant.window_start).getTime() : Number.NaN;
  const end = grant.window_end ? new Date(grant.window_end).getTime() : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    blockers.push("License start and end dates are required.");
  } else {
    if (end <= start) blockers.push("License end must be after the start date.");
    if (end <= now) blockers.push("License window must end in the future.");
  }

  const evidence = grant.evidence?.find((item) =>
    Boolean(item.agreementReference || item.ownershipReference || item.commercialTerms),
  );
  if ((evidence?.agreementReference?.trim().length ?? 0) < 8)
    blockers.push("Agreement reference must contain at least 8 characters.");
  if ((evidence?.ownershipReference?.trim().length ?? 0) < 8)
    blockers.push("Ownership evidence reference must contain at least 8 characters.");

  const ownerShare = evidence?.commercialTerms?.rightsOwnerSharePct;
  const distributorShare = evidence?.commercialTerms?.distributorSharePct;
  if (
    !Number.isInteger(ownerShare) ||
    !Number.isInteger(distributorShare) ||
    ownerShare! < 0 ||
    ownerShare! > 100 ||
    distributorShare! < 0 ||
    distributorShare! > 100 ||
    ownerShare! + distributorShare! !== 100
  ) {
    blockers.push("Recorded revenue shares must be whole percentages that total 100%.");
  }
  return blockers;
}

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
