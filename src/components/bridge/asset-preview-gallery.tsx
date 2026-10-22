import { useState } from "react";
import { requestAssetDownload } from "@/lib/bridge/assets";

type PreviewAsset = {
  id: string;
  kind: string;
  contentType: string | null;
  byteSize: number | null;
  verified: boolean;
};

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

export function AssetPreviewGallery({ assets }: { assets: PreviewAsset[] }) {
  const [selected, setSelected] = useState<PreviewAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  async function openPreview(asset: PreviewAsset) {
    if (!asset.verified || loadingId) return;
    setSelected(asset);
    setPreviewUrl(null);
    setFailedId(null);
    setLoadingId(asset.id);
    try {
      // Resolve an expiring, server-authorized URL only after the user requests a preview.
      const signed = await requestAssetDownload({ data: { assetId: asset.id } });
      if (!signed?.url) throw new Error("Preview URL unavailable");
      setPreviewUrl(signed.url);
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

  const mediaAssets = assets.filter((asset) => asset.verified && (isImage(asset) || isVideo(asset)));

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
            <h3 id="asset-preview-heading" className="mt-1 text-xl font-semibold">Preview Gallery</h3>
            <p className="mt-1 text-sm text-muted">Secure previews · Verified assets only</p>
          </div>
          <span className="text-xs text-muted">{mediaAssets.length} item{mediaAssets.length === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mediaAssets.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-xl border border-line bg-elevated/30">
              <button
                type="button"
                onClick={() => void openPreview(asset)}
                disabled={loadingId !== null}
                className="group block w-full text-left disabled:cursor-wait"
                aria-label={`Preview ${asset.kind.replaceAll("_", " ")}`}
              >
                <div className={`grid place-items-center bg-black/5 ${isVideo(asset) ? "aspect-video" : "aspect-[4/3]"}`}>
                  <span className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold group-hover:border-accent">
                    {loadingId === asset.id ? "Loading preview…" : isVideo(asset) ? "▶ Play video" : "View image"}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold capitalize">{asset.kind.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted">{prettySize(asset.byteSize)} · Storage verified</p>
                </div>
              </button>
            </article>
          ))}
        </div>
      </section>

      {selected ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-preview-title"
          onKeyDown={(event) => { if (event.key === "Escape") closePreview(); }}
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-line p-4">
              <div className="min-w-0">
                <h4 id="asset-preview-title" className="truncate text-base font-semibold capitalize">{selected.kind.replaceAll("_", " ")}</h4>
                <p className="text-xs text-muted">Authorized, time-limited preview</p>
              </div>
              <button type="button" onClick={closePreview} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
                Close
              </button>
            </div>
            <div className="grid min-h-48 flex-1 place-items-center overflow-auto bg-black p-3 sm:p-6">
              {loadingId === selected.id ? (
                <p className="text-sm text-white" role="status">Loading preview…</p>
              ) : failedId === selected.id ? (
                <div className="text-center text-white">
                  <p className="text-sm font-semibold">Preview unavailable</p>
                  <p className="mt-1 text-xs text-white/70">The secure preview could not be opened. The asset was not uploaded again.</p>
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
                  className="max-h-[75vh] w-full"
                  onError={() => setFailedId(selected.id)}
                  aria-label={`${selected.kind} preview`}
                />
              ) : previewUrl && isImage(selected) ? (
                <img
                  key={previewUrl}
                  src={previewUrl}
                  alt={`${selected.kind.replaceAll("_", " ")} preview`}
                  className="max-h-[75vh] max-w-full object-contain"
                  onError={() => setFailedId(selected.id)}
                />
              ) : previewUrl ? (
                <p className="text-sm text-white">Preview is not supported for this file type.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
