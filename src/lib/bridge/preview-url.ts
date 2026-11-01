/** Browser playback needs a media type and inline disposition.
 * The stored object is not rewritten. These are response overrides on the read link. */
export function previewUrlFor(signedUrl: string, kind: string, contentType: string | null) {
  const url = new URL(signedUrl);
  const type = inlineContentType(kind, contentType);
  if (type) url.searchParams.set("httpResponseContentType", type);
  url.searchParams.set("httpResponseContentDisposition", "inline");
  return url.toString();
}

function inlineContentType(kind: string, contentType: string | null) {
  const stored = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (stored.startsWith("video/") || stored.startsWith("image/")) return stored;
  if (kind === "master" || kind === "screener" || kind === "trailer") return "video/mp4";
  if (kind === "poster" || kind === "poster_vertical" || kind === "poster_horizontal" || kind === "thumbnail") return "image/jpeg";
  return null;
}
