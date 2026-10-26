import { useEffect, useState } from "react";
import { getBearerToken } from "@/lib/auth/client";

type BridgeAsset = {
  id: string;
  title_id: string;
  title_name: string;
  kind: string;
  storage_state: "VERIFIED" | "UNVERIFIED" | string;
  byte_size: number | null;
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
        const token = await getBearerToken();
        if (!token) throw new Error("Sign in again to view assets.");
        const query = new URLSearchParams();
        if (titleId) query.set("title_id", titleId);
        const response = await fetch(`/api/bridge/super-admin/assets?${query.toString()}`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as { assets?: BridgeAsset[]; error?: string };
        if (!response.ok) throw new Error(response.status === 403 ? "Verified super-admin access required." : payload.error ?? "Could not load assets.");
        setAssets(Array.isArray(payload.assets) ? payload.assets : []);
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
          <p className="mt-1 text-sm text-slate-600">Server-reported storage verification state; signed previews expire.</p>
        </div>
        <span className="text-sm text-slate-500">{assets.length} asset{assets.length === 1 ? "" : "s"}</span>
      </div>
      {loading && <p className="text-sm text-slate-600">Loading assets…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && assets.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No assets found.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => {
          const verified = asset.storage_state === "VERIFIED";
          const isImage = ["poster", "poster_vertical", "poster_horizontal", "thumbnail"].includes(asset.kind);
          return (
            <article key={asset.id} className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex aspect-video items-center justify-center bg-slate-50">
                {isImage && asset.preview_url
                  ? <img src={asset.preview_url} alt={`${asset.title_name} — ${asset.kind}`} loading="lazy" className="h-full w-full object-contain" />
                  : <div className="px-4 text-center text-xs text-slate-500"><p className="font-medium">{asset.kind}</p><p className="mt-1">{verified ? "Verified object" : "Not verified"}</p></div>}
              </div>
              <div className="space-y-2 p-4">
                <h3 className="line-clamp-2 font-medium text-slate-900">{asset.title_name || "Untitled"}</h3>
                <p className="text-sm text-slate-600">{asset.kind}</p>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${verified ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {asset.storage_state}
                </span>
                {asset.byte_size != null && <p className="text-xs text-slate-500">{(asset.byte_size / (1024 * 1024)).toFixed(1)} MiB</p>}
                {asset.created_at && <time dateTime={asset.created_at} className="block text-xs text-slate-500">{new Date(asset.created_at).toLocaleString()}</time>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
