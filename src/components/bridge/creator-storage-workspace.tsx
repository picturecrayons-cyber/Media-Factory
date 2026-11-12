import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listTitleAssets } from "@/lib/bridge/assets";
import { listTitles } from "@/lib/bridge/titles";

export function CreatorStorageWorkspace() {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = (titlesQ.data?.titles ?? []).slice(0, 40);
  const assetQueries = useQueries({
    queries: titles.map((title) => ({
      queryKey: ["bridge-title-assets", title.id],
      queryFn: () => listTitleAssets({ data: { titleId: title.id } }),
      enabled: Boolean(title.id),
      staleTime: 30_000,
    })),
  });
  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading your storage…</p>;
  if (titlesQ.isError) return <p role="alert" className="text-sm text-accent">Storage inventory is unavailable. Retry the workspace.</p>;
  if (!titles.length) return <p className="text-sm text-muted">Create a title to start its secure asset storage.</p>;
  return (
    <section className="space-y-3">
      <div><h2 className="text-lg font-semibold">Storage by title</h2><p className="text-xs text-muted">Only verified assets with a recorded positive byte size are counted. Object keys and private URLs are not exposed here.</p></div>
      <ul className="divide-y divide-line rounded-sm border border-line">
        {titles.map((title, index) => {
          const q = assetQueries[index];
          const assets = q?.data?.assets ?? [];
          const totalBytes = assets.reduce((sum, asset) => sum + Number(asset.byteSize ?? 0), 0);
          return (
            <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link>
                <p className="mt-1 text-xs text-muted">{q?.isPending ? "Checking verified assets…" : q?.isError ? "Asset inventory unavailable" : `${assets.length} verified asset(s) · ${(totalBytes / (1024 ** 3)).toFixed(2)} GiB`}</p>
              </div>
              <Link to="/title/$id" params={{ id: title.id }} className="text-xs font-semibold text-accent hover:underline">Open title storage →</Link>
            </li>
          );
        })}
      </ul>
      {titlesQ.data?.titles && titlesQ.data.titles.length > titles.length ? <p className="text-xs text-muted">Showing the 40 most recently updated titles.</p> : null}
    </section>
  );
}
