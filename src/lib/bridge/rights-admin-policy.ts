export type EvidenceReviewStatus =
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "DISPUTED"
  | "SUPERSEDED";

export type TitleEvidenceStatus = "MISSING" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED" | "DISPUTED";

/**
 * A title right is verified only when at least one supporting item is verified
 * and no unresolved/rejected evidence remains. Missing evidence never implies
 * availability.
 */
export function summarizeEvidenceStatus(statuses: readonly EvidenceReviewStatus[]): TitleEvidenceStatus {
  if (statuses.length === 0) return "MISSING";
  if (statuses.includes("DISPUTED")) return "DISPUTED";
  if (statuses.includes("REJECTED")) return "REJECTED";
  if (statuses.includes("PENDING_REVIEW")) return "PENDING_REVIEW";
  if (statuses.includes("VERIFIED")) return "VERIFIED";
  return "MISSING";
}
