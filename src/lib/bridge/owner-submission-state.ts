export type OwnerSubmissionStatus = "DRAFT" | "SUBMITTED" | "NEEDS_CORRECTION" | "ACCEPTED_INTAKE";
export type OwnerSubmissionDecision = "ACCEPTED_INTAKE" | "REQUEST_CHANGES";
export type OwnerSubmissionAction = "SUBMITTED" | "RESUBMITTED" | OwnerSubmissionDecision;

export function editableOwnerSubmissionStatus(current: string | null | undefined): "DRAFT" | "NEEDS_CORRECTION" {
  if (!current || current === "DRAFT") return "DRAFT";
  if (current === "NEEDS_CORRECTION") return "NEEDS_CORRECTION";
  throw new Error("Submission details are locked while pending review or after intake acceptance");
}

export function ownerSubmissionSubmitTransition(current: string): {
  action: "SUBMITTED" | "RESUBMITTED";
  fromStatus: "DRAFT" | "NEEDS_CORRECTION";
  toStatus: "SUBMITTED";
} {
  if (current === "DRAFT" || current === "NEEDS_CORRECTION") {
    return {
      action: current === "NEEDS_CORRECTION" ? "RESUBMITTED" : "SUBMITTED",
      fromStatus: current,
      toStatus: "SUBMITTED",
    };
  }
  throw new Error("This owner submission is already pending review or accepted into intake");
}

export function ownerSubmissionReviewTransition(
  current: string,
  decision: OwnerSubmissionDecision,
): {
  action: OwnerSubmissionDecision;
  fromStatus: "SUBMITTED";
  toStatus: "ACCEPTED_INTAKE" | "NEEDS_CORRECTION";
} {
  if (current !== "SUBMITTED") throw new Error("Submission is no longer pending review");
  return {
    action: decision,
    fromStatus: "SUBMITTED",
    toStatus: decision === "ACCEPTED_INTAKE" ? "ACCEPTED_INTAKE" : "NEEDS_CORRECTION",
  };
}
