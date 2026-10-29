export const CURRENT_ARTWORK_KINDS = ["poster", "poster_vertical", "poster_horizontal"] as const;

export function isCurrentArtworkAsset(kind: string, assetKey: string | null, currentArtworkKey: string | null): boolean {
  return CURRENT_ARTWORK_KINDS.includes(kind as (typeof CURRENT_ARTWORK_KINDS)[number]) &&
    Boolean(currentArtworkKey) &&
    assetKey === currentArtworkKey;
}

export type TitleWorkflowSignals = {
  metadataComplete: boolean;
  verifiedMaster: boolean;
  verifiedArtwork: boolean;
  privateScreener: boolean;
  qcPassed: boolean;
  rightsGrantValid: boolean;
  rightsEvidenceReady: boolean;
  legalApproved: boolean;
  legalEvidenceReady: boolean;
  destinationPackageReady: boolean;
  loopPublicationActive: boolean;
};

export type TitleWorkflowGate = {
  id: keyof TitleWorkflowSignals;
  title: string;
  owner: string;
  stage: "Prepare" | "Business" | "Distribution";
  complete: boolean;
};

const gateDefinitions: Array<Pick<TitleWorkflowGate, "id" | "title" | "owner" | "stage">> = [
  { id: "metadataComplete", title: "Core title details complete", owner: "Creator / Studio", stage: "Prepare" },
  { id: "verifiedMaster", title: "Current master uploaded and verified", owner: "Creator / Studio", stage: "Prepare" },
  { id: "verifiedArtwork", title: "Current artwork linked and verified", owner: "Creator / Studio", stage: "Prepare" },
  { id: "privateScreener", title: "Private screener available for review", owner: "Creator / Studio", stage: "Prepare" },
  { id: "qcPassed", title: "Technical QC passed", owner: "QC Reviewer", stage: "Prepare" },
  { id: "rightsGrantValid", title: "Rights / license terms valid for the window", owner: "Rights Owner / Authorized Distributor", stage: "Business" },
  { id: "rightsEvidenceReady", title: "Agreement and ownership references recorded", owner: "Rights Owner / Authorized Distributor", stage: "Business" },
  { id: "legalApproved", title: "Independent legal review approved", owner: "Legal Reviewer", stage: "Business" },
  { id: "legalEvidenceReady", title: "Legal review finding recorded", owner: "Legal Reviewer", stage: "Business" },
  { id: "destinationPackageReady", title: "Distribution package created", owner: "Bridge Distribution Operations", stage: "Distribution" },
  { id: "loopPublicationActive", title: "Crayons Loop publication authorized and in window", owner: "Bridge Publishing / Distribution Admin", stage: "Distribution" },
];

export function buildTitleWorkflowProgress(signals: TitleWorkflowSignals) {
  const gates: TitleWorkflowGate[] = gateDefinitions.map((definition) => ({
    ...definition,
    complete: signals[definition.id],
  }));
  const completed = gates.filter((gate) => gate.complete).length;
  return {
    gates,
    completed,
    total: gates.length,
    percent: Math.round((completed / gates.length) * 100),
    nextGate: gates.find((gate) => !gate.complete) ?? null,
  };
}
