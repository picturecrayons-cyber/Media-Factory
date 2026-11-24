/** QC asset-role compatibility for direct keys and sealed verified references. */
export type VerifiedAssetRef = { id: string; kind: string; s3_key: string };

/**
 * Verified object sealing keeps bridge_assets.s3_key at the immutable upload
 * source, while bridge_titles pointers reference <source>.verified/<asset-id>.
 * Match only when the source path AND immutable row id both agree.
 */
export function pointsToVerifiedAsset(pointer: string, asset: VerifiedAssetRef): boolean {
  if (asset.s3_key === pointer) return true;
  const marker = ".verified/";
  const index = pointer.lastIndexOf(marker);
  if (index < 0) return false;
  const sourceKey = pointer.slice(0, index);
  const sealedAssetId = pointer.slice(index + marker.length);
  return Boolean(sealedAssetId) && sealedAssetId === asset.id && sourceKey === asset.s3_key;
}

/** Assets passed here are already scoped to the title and filtered by positive verified byte size. */
export function hasVerifiedMasterAndArtwork(
  assets: readonly VerifiedAssetRef[],
  masterKey: string | null,
  posterKey: string | null,
): boolean {
  if (!masterKey || !posterKey) return false;
  const master = assets.some((asset) => asset.kind === "master" && pointsToVerifiedAsset(masterKey, asset));
  const artwork = assets.some(
    (asset) => (asset.kind === "poster" || asset.kind === "poster_vertical") &&
      pointsToVerifiedAsset(posterKey, asset),
  );
  return master && artwork;
}
