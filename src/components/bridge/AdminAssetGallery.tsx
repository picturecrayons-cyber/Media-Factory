import { useEffect, useState } from "react";
import { getBearerToken } from "@/lib/auth/client";

type BridgeAsset = {
  id: string;
  title_id: string;
  title_name: string;
  kind: string;
  storage_business_state: string;
  s3_key: string | null;
  preview_url?: string | null;
  created_at?: string;
};

type Props = { titleId?: string };

export default function AdminAssetGallery({ titleId }: Props) {
  const [assets, setAssets] = useState<BridgeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAssets() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (titleId) query.set("title_id", titleId);
        const token = await getBearerToken();
        if (!token) throw new Error("Sign in again to view assets.");
        const response = await fetch(`/api/bridge/assets?${query.toString()}`, {
          credentials: "include",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(response.status === 403 ? "Super-admin access required." : "Could not load assets.");
        const data = (await response.json()) as { assets?: BridgeAsset[] };
        setAssets(Array.isArray(data.assets) ? data.assets : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load assets.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAssets();
    return () => controller.abort();
  }, [titleId]);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Asset gallery</h2>
          <p className="mt-1 text-sm text-slate-600">Bridge assets and their current storage state.</p>
        </div>
        <span className="text-sm text-slate-500">{assets.length} asset{assets.length === 1 ? "" : "s"}</span>
      </div>

      {loading && <p className="text-sm text-slate-600">Loading assets…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && assets.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No assets found.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => {
          const active = asset.storage_business_state === "ACTIVE";
          const imageUrl = asset.preview_url;
          const isImage = ["poster_vertical", "poster_horizontal", "thumbnail", "poster"].includes(asset.kind);
          return (
            <article key={asset.id} className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex aspect-video items-center justify-center bg-slate-50">
                {isImage && imageUrl ? (
                  <img src={imageUrl} alt={`${asset.title_name} — ${asset.kind}`} loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <div className="px-4 text-center text-xs text-slate-500">
                    <p className="font-medium">{asset.kind}</p>
                    <p className="mt-1">{asset.s3_key ? "Stored object" : "No storage key"}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                <h3 className="line-clamp-2 font-medium text-slate-900">{asset.title_name || "Untitled"}</h3>
                <p className="text-sm text-slate-600">{asset.kind}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                    {asset.storage_business_state || "NOT RECORDED"}
                  </span>
                  {asset.created_at && <time className="text-xs text-slate-500" dateTime={asset.created_at}>{new Date(asset.created_at).toLocaleDateString()}</time>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
