import type { ReactNode } from "react";

export type AssetGalleryItem = {
  id: string;
  kind: string;
  verified: boolean;
};

export function AssetGallery({
  assets,
  onDownload,
}: {
  assets: AssetGalleryItem[];
  onDownload: (assetId: string) => void;
}) {
  if (assets.length === 0) {
    return <p className="mt-5 text-xs text-muted">No asset records to display.</p>;
  }

  return (
    <div className="mt-5 space-y-2" aria-label="Asset gallery">
      {assets.map((asset) => (
        <div
          key={asset.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-line p-4"
        >
          <div>
            <p className="text-sm font-semibold">{asset.kind}</p>
            <p className="text-xs text-muted">
              {asset.verified ? "Verified" : "Not verified"}
            </p>
          </div>
          {asset.verified ? (
            <button
              type="button"
              onClick={() => onDownload(asset.id)}
              className="rounded-full border border-line px-4 py-2 text-xs font-semibold"
            >
              Download
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function UploadStatusMessage({ message }: { message: ReactNode | null }) {
  if (!message) return null;
  return (
    <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
      {message}
    </p>
  );
}
