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


/** Only the master referenced by the title's canonical pointer belongs in the primary preview gallery. */
export function isCanonicalGalleryAsset(
  asset: { id: string; kind: string; s3_key: string },
  masterKey: string | null,
): boolean {
  if (asset.kind !== "master") return true;
  if (!masterKey) return false;
  return asset.s3_key === masterKey || masterKey.endsWith(`/${asset.id}`);
}
