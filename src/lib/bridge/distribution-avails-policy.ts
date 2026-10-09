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
