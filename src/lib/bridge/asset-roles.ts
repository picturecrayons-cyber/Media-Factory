/** QC asset-role compatibility for current vertical artwork and legacy poster uploads. */
export type VerifiedAssetRef = { id?: string; kind: string; s3_key: string };

/** Assets passed here must already be scoped to this title and filtered to byte_size > 0. */
function pointerMatchesAsset(pointer: string, asset: VerifiedAssetRef): boolean {
  return (
    asset.s3_key === pointer ||
    (!!asset.id &&
      pointer.startsWith(asset.s3_key + ".verified/") &&
      pointer.endsWith("/" + asset.id))
  );
}

export function hasVerifiedMasterAndArtwork(
  assets: readonly VerifiedAssetRef[],
  masterKey: string | null,
  posterKey: string | null,
): boolean {
  if (!masterKey || !posterKey) return false;

  // Asset rows retain the source OCI key; title pointers identify the sealed
  // copy as <source-key>.verified/<asset-id>. Reconcile both master and artwork
  // pointers against the same source-key + asset-ID invariant.
  const masterReady = assets.some(
    (asset) => asset.kind === "master" && pointerMatchesAsset(masterKey, asset),
  );
  const artworkReady = assets.some(
    (asset) =>
      (asset.kind === "poster" || asset.kind === "poster_vertical") &&
      pointerMatchesAsset(posterKey, asset),
  );
  return masterReady && artworkReady;
}
