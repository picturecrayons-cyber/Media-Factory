/** QC asset-role compatibility for current vertical artwork and legacy poster uploads. */
export type VerifiedAssetRef = { kind: string; s3_key: string };

/** Assets passed here must already be scoped to this title and filtered to byte_size > 0. */
export function hasVerifiedMasterAndArtwork(
  assets: readonly VerifiedAssetRef[],
  masterKey: string | null,
  posterKey: string | null,
): boolean {
  const masterReady = Boolean(
    masterKey && assets.some((asset) => asset.kind === "master" && asset.s3_key === masterKey),
  );
  const artworkReady = assets.some(
    (asset) =>
      (asset.kind === "poster" || asset.kind === "poster_vertical") &&
      Boolean(asset.s3_key) &&
      (posterKey == null || asset.s3_key === posterKey),
  );
  return masterReady && artworkReady;
}
