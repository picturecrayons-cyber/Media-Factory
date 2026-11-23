export type OwnerAdminSubmissionReadinessInput = {
  titleStatus: string;
  masterKey: string | null;
  posterKey: string | null;
  masterAssetVerified: boolean;
  artworkAssetVerified: boolean;
  activeStudioMembership: boolean;
};

export function evaluateOwnerAdminSubmissionReadiness(input: OwnerAdminSubmissionReadinessInput) {
  const masterReady = Boolean(input.masterKey) && input.masterAssetVerified;
  const artworkReady = Boolean(input.posterKey) && input.artworkAssetVerified;
  return {
    masterReady,
    artworkReady,
    activeStudioMembership: input.activeStudioMembership,
    eligible: input.titleStatus === "PREPARING" && masterReady && artworkReady && input.activeStudioMembership,
  };
}

export function canResubmitOwnerAdminSubmission(status: string | null | undefined): boolean {
  return status == null || status === "DRAFT" || status === "NEEDS_CORRECTION";
}
