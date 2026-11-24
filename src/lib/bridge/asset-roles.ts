/** QC asset-role compatibility for current vertical artwork and legacy poster uploads. */
export type VerifiedAssetRef = { id: string; kind: string; s3_key: string };

/**
 * A verified upload is sealed at <original-key>.verified/<asset-id>, while
 * bridge_assets.s3_key intentionally retains the original object key.
 * Resolve that pointer only when both the original key and row ID match.
 */
export function pointsToVerifiedAsset(pointer: string, asset: VerifiedAssetRef): boolean {
  if (asset.s3_key === pointer) return true;
  const marker = ".verified/";
  const suffixAt = pointer.lastIndexOf(marker);
  if (suffixAt < 0) return false;
  const originalKey = pointer.slice(0, suffixAt);
  const assetId = pointer.slice(suffixAt + marker.length);
  return Boolean(assetId) && assetId === asset.id && originalKey === asset.s3_key;
}

/** Assets passed here must already be scoped to this title and filtered to byte_size > 0. */
export function hasVerifiedMasterAndArtwork(
  assets: readonly VerifiedAssetRef[],
  masterKey: string | null,
  posterKey: string | null,
): boolean {
  if (!masterKey || !posterKey) return false;
  const masterReady = assets.some(
    (asset) => asset.kind === "master" && pointsToVerifiedAsset(masterKey, asset),
  );
  const artworkReady = assets.some(
    (asset) =>
      (asset.kind === "poster" || asset.kind === "poster_vertical") &&
      pointsToVerifiedAsset(posterKey, asset),
  );
  return masterReady && artworkReady;
}
