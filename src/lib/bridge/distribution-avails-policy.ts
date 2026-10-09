export type StructuredRightsWindow = {
  territories: unknown;
  languages: unknown;
  media: unknown;
  window_start: string | Date | null;
  window_end: string | Date | null;
  exclusivity: string;
};

function tokens(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().toUpperCase()).filter(Boolean)
    : [];
}

function dimensionOverlaps(left: string[], right: string[], wildcard: string[]): boolean {
  return left.some((value) => wildcard.includes(value)) ||
    right.some((value) => wildcard.includes(value)) ||
    left.some((value) => right.includes(value));
}

/** True only when two current rights windows overlap across territory, language and media,
 * and at least one grant is exclusive. This is a conflict flag for human review, not a legal ruling.
 */
export function hasExclusiveRightsOverlap(grants: StructuredRightsWindow[]): boolean {
  return grants.some((grant, index) => grants.slice(index + 1).some((other) => {
    const exclusive = grant.exclusivity.trim().toUpperCase() === "EXCLUSIVE" ||
      other.exclusivity.trim().toUpperCase() === "EXCLUSIVE";
    if (!exclusive || !grant.window_start || !grant.window_end || !other.window_start || !other.window_end) return false;
    const startA = new Date(grant.window_start);
    const endA = new Date(grant.window_end);
    const startB = new Date(other.window_start);
    const endB = new Date(other.window_end);
    if (![startA, endA, startB, endB].every((date) => Number.isFinite(date.getTime()))) return false;
    if (!(startA < endB && startB < endA)) return false;
    return dimensionOverlaps(tokens(grant.territories), tokens(other.territories), ["WORLDWIDE", "GLOBAL", "ALL", "*"]) &&
      dimensionOverlaps(tokens(grant.languages), tokens(other.languages), ["ALL", "*"]) &&
      dimensionOverlaps(tokens(grant.media), tokens(other.media), ["ALL", "*", "DIGITAL", "OTT", "STREAMING"]);
  }));
}


export type DistributionAvailsRow = {
  id: string;
  name: string;
  language: string | null;
  year: number | null;
  runtime_minutes: number | null;
  content_type: string | null;
  status: string;
  master_key: string | null;
  poster_key: string | null;
  master_verified: boolean;
  qc_verified: boolean;
  legal_review_recorded: boolean;
  valid_rights_grants: Array<{
    id: string;
    territories: string[];
    languages: string[];
    media: string[];
    window_start: string | null;
    window_end: string | null;
    exclusivity: string;
    holdbacks: string[];
  }>;
};

/** Pure fail-closed assessment, kept separate from server-only imports for direct Node tests. */
export function assessDistributionAvails(row: DistributionAvailsRow, now = new Date()) {
  const blockers: string[] = [];
  if (!row.name.trim() || !row.language?.trim() || !row.year || !row.runtime_minutes || !row.content_type?.trim()) {
    blockers.push("Core metadata is incomplete");
  }
  if (!row.master_key || !row.master_verified) blockers.push("Current master asset is not verified");
  if (!row.poster_key) blockers.push("Poster/artwork is missing");
  if (!row.qc_verified) blockers.push("Current master/artwork QC sign-off is missing");
  if (!row.legal_review_recorded) blockers.push("Recorded legal review evidence is missing");
  const activeGrants = row.valid_rights_grants.filter((grant) => {
    if (!Array.isArray(grant.territories) || !grant.territories.length ||
        !Array.isArray(grant.languages) || !grant.languages.length ||
        !Array.isArray(grant.media) || !grant.media.length ||
        !grant.window_start || !grant.window_end) return false;
    const start = new Date(grant.window_start);
    const end = new Date(grant.window_end);
    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start <= now && end > now && end > start;
  });
  if (!activeGrants.length) blockers.push("No current, structured rights grant with explicit territory, language, media and finite window");
  const hasInvalidStructuredValues = activeGrants.some((grant) => {
    const territories = grant.territories as unknown[];
    const media = grant.media as unknown[];
    const holdbacks = Array.isArray(grant.holdbacks) ? grant.holdbacks : [];
    return territories.some((value) => typeof value !== "string" || !value.trim()) ||
      media.some((value) => typeof value !== "string" || !value.trim()) ||
      holdbacks.some((value) => typeof value !== "string" || !value.trim());
  });
  if (hasInvalidStructuredValues) blockers.push("Rights dimensions or holdbacks contain invalid structured values");
  if (hasExclusiveRightsOverlap(activeGrants)) blockers.push("Potential overlapping exclusive grants require operator/legal review");
  return {
    decision: blockers.length === 0 ? "NEEDS_OPERATOR_REVIEW" as const : "HOLD" as const,
    blockers,
    rightsGrantCount: activeGrants.length,
  };
}
