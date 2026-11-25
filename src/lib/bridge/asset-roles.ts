/** QC asset-role compatibility for current vertical artwork and legacy poster uploads. */
export type VerifiedAssetRef = { kind: string; s3_key: string };

/** Assets passed here must already be scoped to this title and filtered to byte_size > 0. */
export function hasVerifiedMasterAndArtwork(
  assets: readonly VerifiedAssetRef[],
  masterKey: string | null,
  posterKey: string | null,
): boolean {
  if (!masterKey || !posterKey) return false;

  const isSealed = (key: string) => key.includes(".verified/");
  const masterReady = assets.some(
    (asset) => asset.kind === "master" && asset.s3_key === masterKey && isSealed(asset.s3_key),
  );
  const artworkReady = assets.some(
    (asset) =>
      (asset.kind === "poster" || asset.kind === "poster_vertical") &&
      asset.s3_key === posterKey &&
      isSealed(asset.s3_key),
  );
  return masterReady && artworkReady;
}
