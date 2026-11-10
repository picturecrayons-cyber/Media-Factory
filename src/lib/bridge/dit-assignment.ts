export type DitAssignmentStatus = "pending" | "active" | "suspended" | "revoked";

export type DitAssignment = {
  assignedUserId: string;
  productionId: string;
  titleId: string;
  assetId: string | null;
  status: DitAssignmentStatus;
};

/**
 * DIT access is assignment-scoped, not inferred from Admin, QC, Studio,
 * Creator, or account ownership. A null requested asset requires a
 * production/title assignment; a concrete asset requires an exact asset match.
 */
export function hasActiveDitAssignment(
  userId: string,
  productionId: string,
  titleId: string,
  assetId: string | null,
  assignments: readonly DitAssignment[],
): boolean {
  if (!userId || !productionId || !titleId) return false;
  return assignments.some((assignment) =>
    assignment.assignedUserId === userId &&
    assignment.productionId === productionId &&
    assignment.titleId === titleId &&
    assignment.status === "active" &&
    (assetId === null || assignment.assetId === assetId)
  );
}
