/** QC asset-role compatibility for current vertical artwork and legacy poster uploads. */
export type VerifiedAssetRef = { id?: string; kind: string; s3_key: string };

/** Assets passed here must already be scoped to this title and filtered to byte_size > 0. */
export function hasVerifiedMasterAndArtwork(
  assets: readonly VerifiedAssetRef[],
  masterKey: string | null,
  posterKey: string | null,
): boolean {
  if (!masterKey || !posterKey) return false;

  // Asset rows retain the source OCI key; title pointers identify the sealed copy
  // as <source-key>.verified/<asset-id>. Require both parts to match exactly.
  const masterReady = assets.some(
    (asset) =>
      asset.kind === "master" &&
      (asset.s3_key === masterKey ||
        (!!asset.id &&
          masterKey.startsWith(asset.s3_key + ".verified/") &&
          masterKey.endsWith("/" + asset.id))),
  );
  const artworkReady = assets.some(
    (asset) =>
      (asset.kind === "poster" || asset.kind === "poster_vertical") &&
      asset.s3_key === posterKey,
  );
  return masterReady && artworkReady;
}