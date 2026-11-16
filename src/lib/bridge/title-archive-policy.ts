export function assertDraftCanBeArchived(input: {
  status: string;
  hasAssets: boolean;
  hasMaster: boolean;
  hasPoster: boolean;
  hasDitSession: boolean;
  hasRights: boolean;
  hasReview: boolean;
  hasCommercial: boolean;
}) {
  if (input.status !== "DRAFT") throw new Error("Only DRAFT titles can be archived.");
  if (input.hasAssets || input.hasMaster || input.hasPoster || input.hasDitSession ||
      input.hasRights || input.hasReview || input.hasCommercial) {
    throw new Error("This draft has linked media, ingest, review, rights or commercial records and cannot be archived.");
  }
}
