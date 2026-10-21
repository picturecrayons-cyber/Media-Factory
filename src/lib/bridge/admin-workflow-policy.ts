export type QcPrerequisites = {
  canProceed: boolean;
  blockers: string[];
  metadata: {
    hasName: boolean;
    hasSynopsis: boolean;
    hasLanguage: boolean;
    hasContentType: boolean;
    hasYear: boolean;
  };
  assets: {
    hasMaster: boolean;
    masterKey: string | null;
    hasPoster: boolean;
    posterKey: string | null;
  };
  currentStatus: string;
};

export type LoopHandoffState =
  | "NOT_READY"
  | "READY_FOR_REVIEW"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "FAILED";

export function evaluateQcPrerequisites(
  title: {
    name?: string | null;
    synopsis?: string | null;
    language?: string | null;
    contentType?: string | null;
    year?: number | null;
    masterKey?: string | null;
    posterKey?: string | null;
    status: string;
  },
  assets: Array<{
    kind: string;
    byte_size?: number | null;
    s3_key?: string | null;
    verified?: boolean;
  }>,
): QcPrerequisites {
  const verifiedMaster = assets.find(
    (a) => a.kind === "master" && Boolean(a.s3_key) && Boolean(title.masterKey) && a.s3_key === title.masterKey,
  ) ?? assets.find((a) => a.kind === "master" && Boolean(a.s3_key));

  const verifiedPoster = assets.find(
    (a) => ["poster_vertical", "poster"].includes(a.kind) && Boolean(a.s3_key),
  );

  const blockers: string[] = [];

  const metadata = {
    hasName: Boolean(title.name?.trim()),
    hasSynopsis: Boolean(title.synopsis?.trim()),
    hasLanguage: Boolean(title.language?.trim()),
    hasContentType: Boolean(title.contentType?.trim()),
    hasYear: Boolean(title.year),
  };

  if (!metadata.hasName) blockers.push("Title name is required");
  if (!metadata.hasSynopsis) blockers.push("Synopsis is required");
  if (!metadata.hasLanguage) blockers.push("Language is required");
  if (!metadata.hasContentType) blockers.push("Content type is required");

  const assetsSummary = {
    hasMaster: Boolean(verifiedMaster),
    masterKey: verifiedMaster?.s3_key ?? title.masterKey ?? null,
    hasPoster: Boolean(verifiedPoster),
    posterKey: verifiedPoster?.s3_key ?? title.posterKey ?? null,
  };

  if (!assetsSummary.hasMaster) {
    blockers.push("A verified master video asset is required before QC submission");
  }
  if (!assetsSummary.hasPoster) {
    blockers.push("A verified poster artwork asset is required before QC submission");
  }

  return {
    canProceed: blockers.length === 0,
    blockers,
    metadata,
    assets: assetsSummary,
    currentStatus: title.status,
  };
}

export function evaluateLoopHandoffState(input: {
  qcPassed: boolean;
  grantValid: boolean;
  hasMasterKey: boolean;
  hasPosterKey: boolean;
  pubStatus?: string | null;
  loopPublished?: boolean;
}): {
  state: LoopHandoffState;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!input.qcPassed) blockers.push("QC approval is required before Loop handoff");
  if (!input.grantValid) blockers.push("An approved, valid distribution rights grant is required");
  if (!input.hasMasterKey) blockers.push("Verified master video key is missing");
  if (!input.hasPosterKey) blockers.push("Verified poster artwork is missing");

  let state: LoopHandoffState = "NOT_READY";
  const pubNorm = input.pubStatus?.toLowerCase();

  if (input.pubStatus && ["authorized", "live"].includes(pubNorm!) && input.loopPublished) {
    state = "ACKNOWLEDGED";
  } else if (input.pubStatus && pubNorm === "failed") {
    state = "FAILED";
  } else if (input.pubStatus && pubNorm === "pending_approval") {
    state = "SUBMITTED";
  } else if (blockers.length === 0) {
    state = "READY_FOR_REVIEW";
  } else {
    state = "NOT_READY";
  }

  return { state, blockers };
}
