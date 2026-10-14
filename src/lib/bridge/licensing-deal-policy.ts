export type LicenseDealScope = {
  rightsCategory: string;
  territories: string[];
  languages: string[];
  mediaModes: string[];
  termStart: string;
  termEnd: string;
  exclusivity: "EXCLUSIVE" | "NON_EXCLUSIVE";
  status: string;
};

function normalize(value: string) {
  return value.trim().toUpperCase();
}

function overlaps(left: string[], right: string[]) {
  const a = new Set(left.map(normalize));
  const b = new Set(right.map(normalize));
  const aAll = a.has("ALL") || a.has("*") || a.has("WORLDWIDE");
  const bAll = b.has("ALL") || b.has("*") || b.has("WORLDWIDE");
  return aAll || bAll || [...a].some((value) => b.has(value));
}

function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Returns true only when an active signed scope conflicts with an exclusive candidate. */
export function hasExclusiveScopeConflict(
  candidate: LicenseDealScope,
  existingDeals: LicenseDealScope[],
) {
  return existingDeals.some((existing) => {
    if (!["ACCEPTED", "PAYMENT_PENDING", "LICENSED"].includes(existing.status)) return false;
    if (normalize(existing.rightsCategory) !== normalize(candidate.rightsCategory)) return false;
    if (existing.exclusivity !== "EXCLUSIVE" && candidate.exclusivity !== "EXCLUSIVE") return false;
    if (!datesOverlap(existing.termStart, existing.termEnd, candidate.termStart, candidate.termEnd)) return false;
    return overlaps(existing.territories, candidate.territories) &&
      overlaps(existing.languages, candidate.languages) &&
      overlaps(existing.mediaModes, candidate.mediaModes);
  });
}
