export const ARCHIVE_BLOCKED_STATUSES = [
  "UPLOADING",
  "PREPARING",
  "QC_REVIEW",
  "RIGHTS_REVIEW",
  "LICENSING_READY",
  "LIVE_FOR_BUYERS",
  "IN_NEGOTIATION",
  "LICENSED",
  "DELIVERED",
] as const;

export type ArchiveStatus = "DRAFT" | (typeof ARCHIVE_BLOCKED_STATUSES)[number];

export function assertDraftCanBeArchived(input: {
  status: string;
  hasAssets: boolean;
  hasMaster: boolean;
  hasPoster: boolean;
  hasActiveDitSession: boolean;
  hasRightsRecords: boolean;
  hasQcRecords: boolean;
  hasLegalRecords: boolean;
  hasFinancialOrCommercialRecords: boolean;
}) {
  if (input.status !== "DRAFT") {
    throw new Error("Only untouched DRAFT titles can be archived.");
  }
  if (
    input.hasAssets ||
    input.hasMaster ||
    input.hasPoster ||
    input.hasActiveDitSession ||
    input.hasRightsRecords ||
    input.hasQcRecords ||
    input.hasLegalRecords ||
    input.hasFinancialOrCommercialRecords
  ) {
    throw new Error(
      "This draft has linked assets, ingest, review, rights or commercial records and cannot be archived.",
    );
  }
}
