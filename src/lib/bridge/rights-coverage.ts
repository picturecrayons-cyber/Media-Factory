export type BridgeRightsGrant = {
  id: string;
  status: string;
  territories: unknown;
  languages: unknown;
  media: unknown;
  window_start: string | Date | null;
  window_end: string | Date | null;
  exclusivity: string;
};

export type RightsCoverageRequest = {
  destination: "CRAYONS_LOOP";
  territories: string[];
  languages: string[];
  exploitationModels: string[];
  windowStart?: string | null;
  windowEnd?: string | null;
  now?: Date;
};

function asUpperStringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean)
  );
}

function coversRequested(granted: Set<string>, requested: string[], wildcards: string[]) {
  if (wildcards.some((token) => granted.has(token))) return true;
  return requested.every((value) => granted.has(value.trim().toUpperCase()));
}

function mediaCovers(grantedMedia: Set<string>, destination: string, exploitationModels: string[]) {
  const broadStreaming = ["OTT", "STREAMING", "DIGITAL", "ALL", "*"].some((token) => grantedMedia.has(token));
  const destinationCovered = broadStreaming || grantedMedia.has(destination.toUpperCase());
  if (!destinationCovered) return false;

  const modelTokensPresent = ["SVOD", "TVOD", "AVOD", "FREE", "PROMOTIONAL"].some((token) => grantedMedia.has(token));
  if (!modelTokensPresent) return true;

  return exploitationModels.every((model) => grantedMedia.has(model.toUpperCase()));
}

function windowCovers(
  grant: BridgeRightsGrant,
  requestedStart: string | null | undefined,
  requestedEnd: string | null | undefined,
  now: Date
) {
  const grantStart = grant.window_start ? new Date(grant.window_start) : null;
  const grantEnd = grant.window_end ? new Date(grant.window_end) : null;
  const effectiveStart = requestedStart ? new Date(requestedStart) : now;
  const effectiveEnd = requestedEnd ? new Date(requestedEnd) : null;

  if (![now, grantStart, grantEnd, effectiveStart, effectiveEnd].every((value) => value === null || Number.isFinite(value.getTime()))) return false;
  if (grantEnd && grantEnd <= now) return false;
  if (effectiveEnd && (effectiveEnd <= effectiveStart || effectiveEnd <= now)) return false;
  if (grantStart && grantEnd && grantEnd <= grantStart) return false;
  if (grantEnd && !effectiveEnd) return false;
  if (grantStart && effectiveStart < grantStart) return false;
  if (grantEnd && effectiveStart >= grantEnd) return false;
  if (grantEnd && effectiveEnd && effectiveEnd > grantEnd) return false;
  return true;
}

export function findCoveringRightsGrant(grants: BridgeRightsGrant[], request: RightsCoverageRequest) {
  const now = request.now ?? new Date();
  if ([request.territories, request.languages, request.exploitationModels].some((values) => values.length === 0 || values.some((value) => !value.trim()))) return null;

  return (
    grants.find((grant) => {
      if (grant.status.toUpperCase() !== "VALID") return false;

      const territories = asUpperStringSet(grant.territories);
      const languages = asUpperStringSet(grant.languages);
      const media = asUpperStringSet(grant.media);

      if (!coversRequested(territories, request.territories, ["WORLDWIDE", "GLOBAL", "ALL", "*"])) return false;
      if (!coversRequested(languages, request.languages, ["ALL", "*"])) return false;
      if (!mediaCovers(media, request.destination, request.exploitationModels)) return false;
      if (!windowCovers(grant, request.windowStart, request.windowEnd, now)) return false;

      return true;
    }) ?? null
  );
}

export function assertPublicationCanExtend(status: string, revokedAt: string | Date | null) {
  if (revokedAt || !["AUTHORIZED", "LIVE"].includes(status.toUpperCase())) {
    throw new Error("Only an active publication can be extended; suspended, revoked or expired publications require fresh authorization.");
  }
}


function rightsTokens(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean));
}

function dimensionsOverlap(left: unknown, right: unknown, wildcards: string[]): boolean {
  const a = rightsTokens(left);
  const b = rightsTokens(right);
  if (a.size === 0 || b.size === 0) return true;
  if (wildcards.some((token) => a.has(token) || b.has(token))) return true;
  return [...a].some((token) => b.has(token));
}

function mediaScopesOverlap(left: unknown, right: unknown): boolean {
  const a = rightsTokens(left);
  const b = rightsTokens(right);
  if (a.size === 0 || b.size === 0) return true;
  if (["ALL", "*"].some((token) => a.has(token) || b.has(token))) return true;
  const online = new Set(["OTT", "STREAMING", "DIGITAL", "CRAYONS_LOOP", "SVOD", "TVOD", "AVOD", "FREE", "PROMOTIONAL"]);
  const leftOnline = [...a].some((token) => online.has(token));
  const rightOnline = [...b].some((token) => online.has(token));
  if (leftOnline && rightOnline && (
    ["OTT", "STREAMING", "DIGITAL"].some((token) => a.has(token) || b.has(token))
  )) return true;
  return [...a].some((token) => b.has(token));
}

function bound(value: string | Date | null): number {
  if (value === null) return Number.NaN;
  return new Date(value).getTime();
}

function windowsOverlap(a: BridgeRightsGrant, b: BridgeRightsGrant): boolean {
  const aStart = bound(a.window_start);
  const aEnd = bound(a.window_end);
  const bStart = bound(b.window_start);
  const bEnd = bound(b.window_end);
  // Missing or malformed bounds on a supposedly valid grant must fail closed.
  if ([aStart, aEnd, bStart, bEnd].some((value) => !Number.isFinite(value))) return true;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Returns true only when the two grants overlap in scope and time and at least
 * one grant is exclusive. This is an approval guard, not a legal determination.
 */
export function hasExclusiveRightsConflict(candidate: BridgeRightsGrant, existing: BridgeRightsGrant): boolean {
  if (candidate.id === existing.id) return false;
  if (candidate.exclusivity.toUpperCase() !== "EXCLUSIVE" &&
      existing.exclusivity.toUpperCase() !== "EXCLUSIVE") return false;
  return dimensionsOverlap(candidate.territories, existing.territories, ["WORLDWIDE", "GLOBAL", "ALL", "*"]) &&
    dimensionsOverlap(candidate.languages, existing.languages, ["ALL", "*"]) &&
    mediaScopesOverlap(candidate.media, existing.media) &&
    windowsOverlap(candidate, existing);
}
