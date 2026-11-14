export interface BuyerEvidenceReviewInput {
  evidenceStatus: string;
  parentStatus: string;
  uploadedBy: string;
  reviewerId: string;
}

/** Evidence can be reviewed only while its parent is pending and by another actor. */
export function canReviewBuyerEvidence(input: BuyerEvidenceReviewInput): boolean {
  return input.evidenceStatus === "pending" &&
    input.parentStatus === "pending_review" &&
    input.uploadedBy !== input.reviewerId;
}
