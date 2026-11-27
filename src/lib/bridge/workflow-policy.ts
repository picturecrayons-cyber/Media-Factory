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

export type LicenseDraftPrefillSource = {
  territories?: string[] | null;
  languages?: string[] | null;
  window_start?: string | Date | null;
  window_end?: string | Date | null;
  exclusivity?: string | null;
  evidence?: Array<{
    agreementReference?: string | null;
    ownershipReference?: string | null;
    commercialTerms?: {
      rightsOwnerSharePct?: number | null;
      distributorSharePct?: number | null;
    } | null;
  }> | null;
};

/**
 * Copy only values already persisted on this title's latest license record.
 * References are not documentary verification; missing/invalid values stay blank.
 */
export function licenseDraftPrefillFromGrant(
  grant: LicenseDraftPrefillSource | null | undefined,
  titleLanguage: string,
) {
  const evidence = grant?.evidence?.[0];
  const terms = evidence?.commercialTerms;
  const ownerShare = terms?.rightsOwnerSharePct;
  const distributorShare = terms?.distributorSharePct;
  const validSplit =
    Number.isInteger(ownerShare) &&
    Number.isInteger(distributorShare) &&
    Number(ownerShare) >= 0 &&
    Number(distributorShare) >= 0 &&
    Number(ownerShare) + Number(distributorShare) === 100;
  const start = grant?.window_start ? new Date(grant.window_start) : null;
  const end = grant?.window_end ? new Date(grant.window_end) : null;
  const validWindow =
    start !== null &&
    end !== null &&
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    end.getTime() > start.getTime() &&
    end.getTime() > Date.now();

  const reference = (value: string | null | undefined) => {
    const normalized = value?.trim() ?? "";
    return normalized.length >= 8 ? normalized : "";
  };

  return {
    territories: grant?.territories?.includes("WORLDWIDE") ? ["WORLDWIDE"] : ["WORLDWIDE"],
    languages: grant?.languages?.length ? [...grant.languages] : [titleLanguage],
    windowStart: validWindow ? start!.toISOString() : "",
    windowEnd: validWindow ? end!.toISOString() : "",
    exclusive: grant?.exclusivity === "EXCLUSIVE",
    agreementReference: reference(evidence?.agreementReference),
    ownershipReference: reference(evidence?.ownershipReference),
    rightsOwnerSharePct: validSplit ? String(ownerShare) : "",
  };
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
