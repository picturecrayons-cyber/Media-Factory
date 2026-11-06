export const REQUIRED_QC_ASSET_SLOTS = [
  { slot: "Main film", kinds: ["master"] },
  { slot: "Screener / Trailer", kinds: ["screener"] },
  { slot: "Vertical poster", kinds: ["poster_vertical", "poster"] },
  { slot: "Horizontal artwork", kinds: ["poster_horizontal"] },
  { slot: "Thumbnail", kinds: ["thumbnail"] },
  { slot: "Subtitles", kinds: ["subtitle"] },
  { slot: "Censor certificate", kinds: ["censor_certificate"] },
] as const;

export type QCIngestAssetEvidence = {
  kind: string; s3Key: string; byteSize: number | null;
  checksumSha256: string | null; provenanceVerified: boolean;
};

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function evaluateVerifiedTitleIngestReadiness(
  assets: readonly QCIngestAssetEvidence[],
  refs: { masterKey: string | null; posterKey: string | null },
) {
  const missingSlots = REQUIRED_QC_ASSET_SLOTS.filter(({ slot, kinds }) => {
    const candidates = assets.filter((asset) => kinds.some((kind) => kind === asset.kind));
    return !candidates.some((asset) =>
      Number.isSafeInteger(asset.byteSize) && Number(asset.byteSize) > 0 &&
      asset.s3Key.includes(".verified/") && asset.provenanceVerified &&
      isSha256Hex(asset.checksumSha256) &&
      (slot !== "Main film" || asset.s3Key === refs.masterKey) &&
      (slot !== "Vertical poster" || !refs.posterKey || asset.s3Key === refs.posterKey),
    );
  }).map(({ slot }) => slot);
  return { ready: missingSlots.length === 0, missingSlots };
}