export type TitleArchiveDependencyFlags = {
  hasAssets: boolean;
  hasAssetVersions: boolean;
  hasProductionAssets: boolean;
  hasIngestSessions: boolean;
  hasQcRecords: boolean;
  hasLegalRecords: boolean;
  hasRightsRecords: boolean;
  hasAuthorizationRecords: boolean;
  hasLoopPublications: boolean;
  hasLoopTitles: boolean;
  hasPayments: boolean;
  hasEntitlements: boolean;
  hasDeliveryRecords: boolean;
  hasSubmissionRecords: boolean;
  hasDocumentRecords: boolean;
  hasBuyerRecords: boolean;
  hasFinanceRecords: boolean;
  hasOtherLinkedRecords: boolean;
};

export function assertArchiveReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 3 || normalized.length > 2000) {
    throw new Error("An archive reason between 3 and 2000 characters is required.");
  }
  return normalized;
}

export function assertDraftCanBeArchived(input: {
  status: string;
  archivedAt?: string | null;
  hasMaster: boolean;
  hasPoster: boolean;
  dependencies: TitleArchiveDependencyFlags;
}) {
  if (input.status !== "DRAFT") throw new Error("Only DRAFT titles can be archived.");
  if (input.archivedAt) throw new Error("This title is already archived.");
  if (input.hasMaster || input.hasPoster) {
    throw new Error("Titles with a master or poster cannot be archived.");
  }
  const protectedDependency = Object.entries(input.dependencies).find(([, found]) => found);
  if (protectedDependency) {
    throw new Error("This title has protected linked records and cannot be archived.");
  }
}

export function assertRestoreCanProceed(input: {
  status: string;
  archivedAt?: string | null;
  hasNewProtectedDependency: boolean;
}) {
  if (input.status !== "DRAFT" || !input.archivedAt) {
    throw new Error("Only archived DRAFT titles can be restored.");
  }
  if (input.hasNewProtectedDependency) {
    throw new Error("This title now has protected linked records and cannot be restored.");
  }
}
