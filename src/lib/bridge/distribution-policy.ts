export type SublicensingException = {
  permitted?: boolean;
  superAdminApproved?: boolean;
  legalReviewApproved?: boolean;
  authorizedBy?: string | null;
  authorizedAt?: string | Date | null;
  legalReference?: string | null;
  titleId?: string | null;
  packageVersion?: number | null;
  directPartner?: string | null;
  downstreamPlatforms?: string[];
  territories?: string[];
  languages?: string[];
  exploitationModels?: string[];
  windowStart?: string | Date | null;
  windowEnd?: string | Date | null;
};

/**
 * Fail-closed sublicensing gate. Ordinary distribution is never enough.
 * This validates evidence only; callers must load/verify that evidence from
 * trusted persisted legal records and must audit any approved exception.
 */
export function assertSublicensingPolicy(input: SublicensingException = {}): false | true {
  if (input.permitted !== true) return false;

  const nonBlank = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;
  const start = input.windowStart ? new Date(input.windowStart) : null;
  const end = input.windowEnd ? new Date(input.windowEnd) : null;
  const windowValid =
    start !== null && end !== null &&
    Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) &&
    end > start && end > new Date();

  const scopeValid =
    nonBlank(input.titleId) &&
    Number.isInteger(input.packageVersion) && (input.packageVersion ?? 0) > 0 &&
    nonBlank(input.directPartner) &&
    Array.isArray(input.downstreamPlatforms) && input.downstreamPlatforms.length > 0 &&
    input.downstreamPlatforms.every(nonBlank) &&
    Array.isArray(input.territories) && input.territories.length > 0 &&
    input.territories.every(nonBlank) &&
    Array.isArray(input.languages) && input.languages.length > 0 &&
    input.languages.every(nonBlank) &&
    Array.isArray(input.exploitationModels) && input.exploitationModels.length > 0 &&
    input.exploitationModels.every(nonBlank) &&
    windowValid;

  const authorizedAt = input.authorizedAt ? new Date(input.authorizedAt) : null;
  if (
    input.superAdminApproved !== true ||
    input.legalReviewApproved !== true ||
    !nonBlank(input.authorizedBy) ||
    !authorizedAt ||
    !Number.isFinite(authorizedAt.getTime()) ||
    !nonBlank(input.legalReference) ||
    !scopeValid
  ) {
    throw new Error("Sublicensing denied: explicit Super Admin approval, legal review, legal reference and complete title/package/partner/platform/territory/language/model/window scope are required.");
  }
  return true;
}

/** Distribution authorization must not imply onward-transfer rights. */
export function defaultSublicensingMetadata() {
  return {
    sublicensingPermitted: false as const,
    sublicensingPolicy: "NOT_PERMITTED" as const,
  };
}
