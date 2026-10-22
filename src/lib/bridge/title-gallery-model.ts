export type GalleryPosterAsset = {
  id: string;
  kind: string;
  contentType: string | null;
  verified: boolean;
};

/**
 * Select only a verified original poster for the title gallery.
 * Thumbnails are deliberately excluded: a thumbnail is not a substitute
 * for the canonical original poster, so callers should show a placeholder.
 */
export function selectVerifiedOriginalPoster(
  assets: readonly GalleryPosterAsset[],
): GalleryPosterAsset | undefined {
  return assets
    .filter(
      (asset) =>
        asset.verified &&
        asset.contentType?.startsWith("image/") &&
        (asset.kind === "poster_vertical" || asset.kind === "poster"),
    )
    .sort((a, b) => {
      const priority = (kind: string) => (kind === "poster_vertical" ? 0 : 1);
      return priority(a.kind) - priority(b.kind);
    })[0];
}
