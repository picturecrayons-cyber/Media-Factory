export type PosterPreviewAsset = {
  id: string;
  kind: string;
  verified: boolean;
  contentType: string | null;
};

/**
 * Select the first verified image poster from the asset list.
 * The caller receives assets in newest-first order from listTitleAssets.
 */
export function findVerifiedPosterAsset<T extends PosterPreviewAsset>(
  assets: readonly T[],
): T | null {
  return (
    assets.find(
      (asset) =>
        asset.verified &&
        (asset.kind === "poster_vertical" || asset.kind === "poster") &&
        Boolean(asset.contentType?.startsWith("image/")),
    ) ?? null
  );
}
