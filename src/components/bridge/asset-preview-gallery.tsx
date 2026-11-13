import { useEffect, useMemo, useState } from "react";
import { requestAssetDownload } from "@/lib/bridge/assets";
import { previewUrlFor } from "@/lib/bridge/preview-url";

type PreviewAsset = {
  id: string;
  kind: string;
  contentType: string | null;
  byteSize: number | null;
  verified: boolean;
};

type GalleryFilter = "all" | "images" | "videos";

function isVideo(asset: PreviewAsset) {
  return ["master", "screener", "trailer"].includes(asset.kind) ||
    Boolean(asset.contentType?.toLowerCase().startsWith("video/"));
}

function isImage(asset: PreviewAsset) {
  return ["poster", "poster_vertical", "poster_horizontal", "thumbnail"].includes(asset.kind) ||
    Boolean(asset.contentType?.toLowerCase().startsWith("image/"));
}

function prettySize(bytes: number | null) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayKind(kind: string) {
  return kind.replaceAll("_", " ");
}

export function AssetPosterSlot({ assets }: { assets: PreviewAsset[] }) {
  const poster = assets.find((asset) =>
    asset.verified && ["poster_vertical", "poster"].includes(asset.kind) && isImage(asset)
  );
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    if (!poster) return () => { active = false; };
    void requestAssetDownload({ data: { assetId: poster.id } })
      .then((signed) => {
        if (active && signed?.url) setUrl(previewUrlFor(signed.url, poster.kind, poster.contentType));
        else if (active) setFailed(true);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [poster?.id]);

  return (
    <div className="aspect-[2/3] overflow-hidden rounded-xl border border-line bg-elevated">
      {url && !failed ? (
        <img
          src={url}
          alt="Verified vertical poster"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="grid h-full place-items-center px-4 text-center text-xs text-muted">
          {poster && !failed ? "Loading poster preview…" : poster ? "Poster preview unavailable" : "Add vertical poster"}
        </div>
      )}
    </div>
  );
}

export function AssetPreviewGallery({ assets }: { assets: PreviewAsset[] }) {
  const [selected, setSelected] = useState<PreviewAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const mediaAssets = useMemo(
    () => assets.filter((asset) => asset.verified && (isImage(asset) || isVideo(asset))),
    [assets],
  );
  const imageAssetIds = mediaAssets.filter(isImage).map((asset) => asset.id).join("|");
  const visibleAssets = mediaAssets.filter((asset) =>
    filter === "all" || (filter === "images" ? isImage(asset) : isVideo(asset))
  );
  const imageCount = mediaAssets.filter(isImage).length;
  const videoCount = mediaAssets.filter(isVideo).length;

  useEffect(() => {
    let active = true;
    const imageAssets = mediaAssets.filter(isImage);
    if (!imageAssets.length) {
      setImageUrls({});
      return () => { active = false; };
    }

    void Promise.all(imageAssets.map(async (asset) => {
      try {
        const signed = await requestAssetDownload({ data: { assetId: asset.id } });
        return signed?.url
          ? [asset.id, previewUrlFor(signed.url, asset.kind, asset.contentType)] as const
          : null;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (!active) return;
      setImageUrls(Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)));
    });

    return () => { active = false; };
  }, [imageAssetIds]);

  async function openPreview(asset: PreviewAsset) {
    if (!asset.verified || loadingId) return;
    setSelected(asset);
    setPreviewUrl(null);
    setFailedId(null);
    setLoadingId(asset.id);
    try {
      // Resolve an expiring, server-authorized URL only after the user requests a preview.
      const cachedImageUrl = isImage(asset) ? imageUrls[asset.id] : null;
      if (cachedImageUrl) {
        setPreviewUrl(cachedImageUrl);
      } else {
        const signed = await requestAssetDownload({ data: { assetId: asset.id } });
        if (!signed?.url) throw new Error("Preview URL unavailable");
        setPreviewUrl(previewUrlFor(signed.url, asset.kind, asset.contentType));
      }
    } catch {
      setFailedId(asset.id);
    } finally {
      setLoadingId(null);
    }
  }

  function closePreview() {
    setSelected(null);
    setPreviewUrl(null);
    setFailedId(null);
    setLoadingId(null);
  }

  function movePreview(direction: -1 | 1) {
    if (!selected || visibleAssets.length < 2) return;
    const currentIndex = visibleAssets.findIndex((asset) => asset.id === selected.id);
    const nextIndex = (currentIndex + direction + visibleAssets.length) % visibleAssets.length;
    void openPreview(visibleAssets[nextIndex]);
  }

  if (!mediaAssets.length) {
    return (
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5" aria-labelledby="asset-preview-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Preview Gallery</p>
        <h3 id="asset-preview-heading" className="mt-1 text-lg font-semibold">Videos and images</h3>
        <p className="mt-2 text-sm text-muted">Verified video and image assets will appear here when available.</p>
      </section>
    );
  }

  return (
    <>
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="asset-preview-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Media</p>
            <h3 id="asset-preview-heading" className="mt-1 text-xl font-semibold">Title Media Gallery</h3>
            <p className="mt-1 text-sm text-muted">Secure previews · Verified assets only</p>
          </div>
          <span className="text-xs text-muted" aria-live="polite">
            {visibleAssets.length} of {mediaAssets.length} items
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter gallery">
          {([
            ["all", `All · ${mediaAssets.length}`],
            ["images", `Images · ${imageCount}`],
            ["videos", `Videos · ${videoCount}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${filter === value
                ? "border-accent bg-accent text-white"
                : "border-line bg-elevated text-muted hover:border-accent hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleAssets.map((asset) => {
            const imageUrl = imageUrls[asset.id];
            return (
              <article key={asset.id} className="group min-w-0 overflow-hidden rounded-xl border border-line bg-elevated/30">
                <button
                  type="button"
                  onClick={() => void openPreview(asset)}
                  disabled={loadingId !== null}
                  className="block w-full text-left disabled:cursor-wait"
                  aria-label={`Open ${displayKind(asset.kind)} preview`}
                >
                  <div className={`relative grid place-items-center overflow-hidden bg-black/90 ${isVideo(asset) ? "aspect-video" : "aspect-[4/3]"}`}>
                    {isImage(asset) && imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`${displayKind(asset.kind)} thumbnail`}
                        loading="lazy"
                        className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 px-3 py-5 text-center text-white">
                        <span className="grid h-11 w-11 place-items-center rounded-full border border-white/50 bg-white/10 text-xl" aria-hidden="true">
                          {isVideo(asset) ? "▶" : "▧"}
                        </span>
                        <span className="text-xs font-medium text-white/80">
                          {isVideo(asset) ? "Video preview" : imageUrls[asset.id] === undefined ? "Loading image…" : "Image preview"}
                        </span>
                      </div>
                    )}
                    {isVideo(asset) ? (
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/75 px-2.5 py-1 text-xs font-semibold text-white">▶ Play</span>
                    ) : null}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold capitalize">{displayKind(asset.kind)}</p>
                    <p className="mt-1 text-xs text-muted">{prettySize(asset.byteSize)} · Verified</p>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {selected ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-preview-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") closePreview();
            if (event.key === "ArrowLeft") movePreview(-1);
            if (event.key === "ArrowRight") movePreview(1);
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-line p-4">
              <div className="min-w-0">
                <h4 id="asset-preview-title" className="truncate text-base font-semibold capitalize">{displayKind(selected.kind)}</h4>
                <p className="text-xs text-muted">Authorized, time-limited preview · {prettySize(selected.byteSize)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => movePreview(-1)}
                  disabled={visibleAssets.length < 2 || loadingId !== null}
                  className="rounded-full border border-line px-3 py-2 text-sm font-semibold disabled:opacity-40"
                  aria-label="Previous gallery item"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => movePreview(1)}
                  disabled={visibleAssets.length < 2 || loadingId !== null}
                  className="rounded-full border border-line px-3 py-2 text-sm font-semibold disabled:opacity-40"
                  aria-label="Next gallery item"
                >
                  →
                </button>
                <button type="button" onClick={closePreview} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
                  Close
                </button>
              </div>
            </div>
            <div className="grid min-h-48 flex-1 place-items-center overflow-auto bg-black p-3 sm:p-6">
              {loadingId === selected.id ? (
                <p className="text-sm text-white" role="status">Loading preview…</p>
              ) : failedId === selected.id ? (
                <div className="text-center text-white">
                  <p className="text-sm font-semibold">Preview unavailable</p>
                  <p className="mt-1 text-xs text-white/70">In-page preview failed. The stored file was not uploaded again.</p>
                  <button type="button" onClick={() => void openPreview(selected)} className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                    Retry preview
                  </button>
                </div>
              ) : previewUrl && isVideo(selected) ? (
                <video
                  key={previewUrl}
                  src={previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[78vh] w-full"
                  onError={() => setFailedId(selected.id)}
                  aria-label={`${selected.kind} preview`}
                />
              ) : previewUrl && isImage(selected) ? (
                <img
                  key={previewUrl}
                  src={previewUrl}
                  alt={`${displayKind(selected.kind)} preview`}
                  className="max-h-[78vh] max-w-full object-contain"
                  onError={() => setFailedId(selected.id)}
                />
              ) : previewUrl ? (
                <p className="text-sm text-white">Preview is not supported for this file type.</p>
              ) : null}
            </div>
            <div className="border-t border-white/10 px-4 py-2 text-center text-xs text-white/70">
              Use the arrow keys or navigation controls to browse the gallery
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
