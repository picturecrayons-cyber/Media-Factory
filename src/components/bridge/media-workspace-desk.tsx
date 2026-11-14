import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listTitleAssets } from "@/lib/bridge/assets";
import { listTitles } from "@/lib/bridge/titles";

type MediaActor = { userId: string; organizationId?: string | null };
type Asset = {
  id: string;
  kind: string;
  contentType: string | null;
  byteSize: number | null;
  verified: boolean;
  createdAt: string;
};

function formatBytes(value: number | null) {
  if (value == null || value <= 0) return "Size unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function MediaWorkspaceDesk({
  actor,
  mode,
}: {
  actor: MediaActor;
  mode: "storage" | "post-production";
}) {
  const titlesQ = useQuery({
    queryKey: ["bridge-media-titles", actor.userId, actor.organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];
  const assetQueries = useQueries({
    queries: titles.map((title) => ({
      queryKey: ["bridge-assets", title.id, actor.userId],
      queryFn: () => listTitleAssets({ data: { titleId: title.id } }),
      enabled: Boolean(titlesQ.data),
      retry: 1,
    })),
  });

  const loading = titlesQ.isPending || assetQueries.some((query) => query.isPending);
  const failed = titlesQ.isError || assetQueries.some((query) => query.isError);
  const rows = titles.map((title, index) => ({
    title,
    assets: (assetQueries[index]?.data?.assets ?? []) as Asset[],
  })).filter((row) => mode === "storage" || row.assets.some((asset) =>
    ["master", "screener", "technical", "subtitle"].includes(asset.kind),
  ));

  const allAssets = rows.flatMap((row) => row.assets);
  const verifiedCount = allAssets.filter((asset) => asset.verified && (asset.byteSize ?? 0) > 0).length;
  const totalBytes = allAssets.reduce((sum, asset) => sum + (asset.byteSize ?? 0), 0);

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          {mode === "storage" ? "Secure media" : "Media finishing"}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">
          {mode === "storage" ? "Storage / Media Vault" : "Post-Production"}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          {mode === "storage"
            ? "Your authorized title assets are listed from Bridge's existing asset records. Open a title to upload, resume, inspect or download files using its secure Files workspace."
            : "Review verified master, screener, technical and subtitle source assets before post-production. Render jobs and automated transcoding are not enabled yet; no output is marked complete by this view."}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Titles in scope" value={String(titles.length)} />
          <Metric label="Verified assets" value={loading ? "…" : String(verifiedCount)} />
          <Metric label="Recorded media" value={loading ? "…" : formatBytes(totalBytes)} />
        </div>
      </header>

      {titlesQ.isPending ? <p className="text-sm text-muted">Loading your authorized titles…</p> : null}
      {failed ? (
        <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm">
          Media records could not be loaded completely. No missing records are represented as empty storage.
          <button type="button" onClick={() => void titlesQ.refetch()} className="ml-2 font-semibold text-accent underline">Retry</button>
        </div>
      ) : null}
      {!loading && !failed && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-sm text-muted">
          No eligible media assets are recorded for the titles in this account yet.
        </div>
      ) : null}

      {rows.map(({ title, assets }) => {
        const visibleAssets = mode === "storage"
          ? assets
          : assets.filter((asset) => ["master", "screener", "technical", "subtitle"].includes(asset.kind));
        return (
          <section key={title.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{title.name}</h3>
                <p className="mt-1 text-xs text-muted">{title.language} · {title.status}</p>
              </div>
              <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-3 py-2 text-xs font-semibold hover:border-accent">
                Open title Files
              </Link>
            </div>
            {visibleAssets.length ? (
              <ul className="mt-4 divide-y divide-line">
                {visibleAssets.map((asset) => (
                  <li key={asset.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium capitalize">{asset.kind.replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted">{asset.contentType || "Type unavailable"} · {formatBytes(asset.byteSize)}</p>
                    </div>
                    <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold">
                      {asset.verified ? "Verified upload" : "Not verified"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">No verified assets recorded for this title.</p>
            )}
          </section>
        );
      })}

      {mode === "post-production" ? (
        <p className="rounded-xl border border-line p-4 text-xs leading-5 text-muted">
          Current capability: source-asset visibility and secure navigation to title Files. Proxy generation, timeline editing, render queue, delivery profiles and persisted output versions still require the post-production worker implementation and Testing certification.
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-elevated/40 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
