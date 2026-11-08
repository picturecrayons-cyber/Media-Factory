/**
 * Fail-closed policy for reversible Bridge title archive/restore.
 *
 * Pure policy only: no database mutation, route, or UI is implemented here.
 * The server action must independently authorize title.archive and persist
 * archived_at/archived_by plus an audit event in one transaction.
 */
export type ArchiveDependencySnapshot = {
  buyerVisible: boolean;
  negotiationOpen: boolean;
  licenseActive: boolean;
  deliveryActive: boolean;
  entitlementActive: boolean;
  loopPublicationActive: boolean;
  financialObligationOpen: boolean;
  rightsGrantActive: boolean;
};

export type ArchiveDecision =
  | { eligible: true; reasons: [] }
  | { eligible: false; reasons: string[] };

const ARCHIVABLE_STATUSES = new Set(["DRAFT"]);

export function evaluateTitleArchive(input: {
  status: string;
  titleName: string;
  confirmedTitleName: string;
  dependencies: ArchiveDependencySnapshot;
}): ArchiveDecision {
  const reasons: string[] = [];
  if (!input.titleName.trim()) reasons.push("Title name is missing");
  if (input.confirmedTitleName !== input.titleName) reasons.push("Title identity confirmation does not match");
  if (!ARCHIVABLE_STATUSES.has(input.status)) reasons.push("Only DRAFT titles are eligible for archive");
  const labels: Array<[keyof ArchiveDependencySnapshot, string]> = [
    ["buyerVisible", "Title is visible to buyers"],
    ["negotiationOpen", "A negotiation is open"],
    ["licenseActive", "An active license exists"],
    ["deliveryActive", "A delivery is active or recorded"],
    ["entitlementActive", "An entitlement is active"],
    ["loopPublicationActive", "A Loop publication is active"],
    ["financialObligationOpen", "A financial obligation is open"],
    ["rightsGrantActive", "An active rights grant exists"],
  ];
  for (const [key, label] of labels) {
    if (input.dependencies[key]) reasons.push(label);
  }
  return reasons.length ? { eligible: false, reasons } : { eligible: true, reasons: [] };
}

export function evaluateTitleRestore(input: {
  archivedAt: string | null;
  archivedBy: string | null;
  slugConflict: boolean;
  titleIdentityAvailable: boolean;
}): ArchiveDecision {
  const reasons: string[] = [];
  if (!input.archivedAt || !Number.isFinite(Date.parse(input.archivedAt))) {
    reasons.push("A valid archive timestamp is required");
  }
  if (!input.archivedBy?.trim()) reasons.push("Archive actor attribution is missing");
  if (input.slugConflict) reasons.push("A conflicting active title slug exists");
  if (!input.titleIdentityAvailable) reasons.push("Original title identity is unavailable");
  return reasons.length ? { eligible: false, reasons } : { eligible: true, reasons: [] };
}
