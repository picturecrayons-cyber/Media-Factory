import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AssetPosterSlot } from "@/components/bridge/asset-preview-gallery";
import { StatusChip } from "@/components/bridge/status-rail";
import { listTitleAssets } from "@/lib/bridge/assets";
import type { BridgeTitle } from "@/lib/bridge/types";

export function StudioFilmCatalogue({ titles }: { titles: BridgeTitle[] }) {
  if (!titles.length) {
    return <p className="mt-2 rounded-lg border border-dashed border-line p-5 text-sm text-muted">No finished-film titles are currently returned for this Studio account.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {titles.map((title) => <StudioFilmCard key={title.id} title={title} />)}
    </div>
  );
}

function StudioFilmCard({ title }: { title: BridgeTitle }) {
  const assetsQ = useQuery({
    queryKey: ["bridge-assets", title.id, "studio-catalogue"],
    queryFn: () => listTitleAssets({ data: { titleId: title.id } }),
    staleTime: 30_000,
    retry: 1,
  });
  const assets = assetsQ.data?.assets ?? [];
  const credits = title.credits ?? [];
  const crew = credits.filter((credit) => credit.role.toLowerCase() !== "cast").slice(0, 2);
  const cast = credits.filter((credit) => credit.role.toLowerCase() === "cast").slice(0, 3);

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 p-3">
        <AssetPosterSlot assets={assets} />
        <div className="min-w-0 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{title.contentType || "Film"}</span>
            <StatusChip status={title.status} />
          </div>
          <Link to="/title/$id" params={{ id: title.id }} className="mt-2 block font-display text-base font-semibold leading-snug hover:text-accent">
            {title.name}
          </Link>
          <p className="mt-1 text-xs text-muted">{[title.language, title.year, title.runtimeMinutes ? `${title.runtimeMinutes} min` : null].filter(Boolean).join(" · ")}</p>
          {assetsQ.isError ? <p className="mt-2 text-[11px] text-muted">Artwork preview unavailable</p> : null}
          {assetsQ.isPending ? <p className="mt-2 text-[11px] text-muted">Checking verified artwork…</p> : null}
        </div>
      </div>
      <div className="border-t border-line px-4 py-3">
        {title.synopsis ? <p className="line-clamp-3 text-sm leading-relaxed text-muted">{title.synopsis}</p> : <p className="text-xs text-muted">Synopsis not provided.</p>}
        {crew.length || cast.length ? (
          <div className="mt-3 space-y-1 text-xs text-muted">
            {crew.map((credit) => <p key={`${credit.role}:${credit.name}`}><span className="font-semibold text-fg">{credit.role}:</span> {credit.name}</p>)}
            {cast.length ? <p><span className="font-semibold text-fg">Cast:</span> {cast.map((credit) => credit.name).join(", ")}</p> : null}
          </div>
        ) : <p className="mt-3 text-xs text-muted">Credits not provided.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-elevated/40 px-4 py-3">
        <p className="text-[11px] text-muted">Private Studio record · Not a public listing</p>
        <Link to="/title/$id" params={{ id: title.id }} className="text-xs font-semibold text-accent hover:underline">Manage title →</Link>
      </div>
    </article>
  );
}
