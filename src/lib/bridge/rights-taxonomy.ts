/**
 * Canonical Crayons Bridge rights vocabulary for admin mapping and buyer discovery.
 * Rights categories describe possible exploitation modes, not title-level ownership
 * or availability. The migration is the database catalog source; keep these codes aligned.
 */
export type RightsFamily = "LINEAR" | "NON_LINEAR" | "ANCILLARY" | "DERIVATIVE" | "TECHNICAL";

export const RIGHTS_FAMILY_LABELS: Record<RightsFamily, string> = {
  LINEAR: "Linear",
  NON_LINEAR: "Non-linear",
  ANCILLARY: "Ancillary",
  DERIVATIVE: "Derivative",
  TECHNICAL: "Technical permissions",
};

export const RIGHTS_EVIDENCE_STATUSES = [
  "MISSING",
  "PENDING_REVIEW",
  "VERIFIED",
  "REJECTED",
  "DISPUTED",
] as const;

export const RIGHTS_AVAILABILITY_STATUSES = [
  "UNKNOWN",
  "AVAILABLE",
  "PARTIALLY_AVAILABLE",
  "COMMITTED",
  "RESTRICTED",
  "EXPIRED",
] as const;

export const RIGHTS_EXCLUSIVITY = ["UNSPECIFIED", "EXCLUSIVE", "NON_EXCLUSIVE"] as const;

export const RIGHTS_MONETISATION_MODELS = [
  "SUBSCRIPTION",
  "RENTAL",
  "DIGITAL_PURCHASE",
  "AD_SUPPORTED",
  "PAY_PER_VIEW",
  "FIXED_FEE",
  "MINIMUM_GUARANTEE",
  "REVENUE_SHARE",
  "PACKAGE",
  "OTHER",
] as const;

export const RIGHTS_LANGUAGE_SCOPES = [
  "ORIGINAL_AUDIO",
  "DUBBED_AUDIO",
  "SUBTITLES",
  "ACCESSIBILITY",
  "ALL_PERMITTED",
] as const;

export const RIGHTS_EVIDENCE_RULES = [
  "A category selection never verifies ownership or clearance.",
  "Unknown rights stay unknown; do not infer availability from missing commitments.",
  "Rights availability is evaluated per category, territory, language and term.",
  "Executed deals and holdbacks must be checked before buyer discovery shows availability.",
  "Film distribution rights do not imply remake, music, character, artwork or underlying-work rights.",
  "Technical processing permission does not grant commercial publication permission.",
  "Loop delivery requires a separate valid Bridge publication grant.",
] as const;
