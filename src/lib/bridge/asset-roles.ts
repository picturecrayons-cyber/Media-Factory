/** QC asset-role compatibility for current vertical artwork and legacy poster uploads. */
export type VerifiedAssetRef = { kind: string; s3_key: string };

/** Assets passed here must already be scoped to this title and filtered to byte_size > 0. */
export function hasVerifiedMasterAndArtwork(
  assets: readonly VerifiedAssetRef[],
  masterKey: string | null,
  posterKey: string | null,
): boolean {
  if (!masterKey || !posterKey) return false;

  const masterReady = assets.some(
    (asset) => asset.kind === "master" && asset.s3_key === masterKey,
  );
  const artworkReady = assets.some(
    (asset) =>
      (asset.kind === "poster" || asset.kind === "poster_vertical") &&
      asset.s3_key === posterKey,
  );
  return masterReady && artworkReady;
}


/** Required finished-film package: master, current vertical poster, horizontal artwork and thumbnail. */
export function hasVerifiedFinishedFilmPackage(
  assets: readonly VerifiedAssetRef[],
  masterKey: string | null,
  posterKey: string | null,
): boolean {
  if (!masterKey || !posterKey) return false;
  const masterReady = assets.some((asset) => asset.kind === "master" && asset.s3_key === masterKey);
  const verticalReady = assets.some(
    (asset) => (asset.kind === "poster_vertical" || asset.kind === "poster") && asset.s3_key === posterKey,
  );
  const horizontalReady = assets.some((asset) => asset.kind === "poster_horizontal");
  const thumbnailReady = assets.some((asset) => asset.kind === "thumbnail");
  return masterReady && verticalReady && horizontalReady && thumbnailReady;
}
