import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getTitle } from "@/lib/bridge/titles";
import { listTitleAssets } from "@/lib/bridge/assets";
import { openTitleAsset } from "@/lib/bridge/simple-desk";
import { SimpleDesk } from "@/components/bridge/simple-desk";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="">
          <TitleBody id={id} actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function TitleBody({ id, actor }: { id: string; actor: BridgeActor }) {
  const titleQ = useQuery({
    queryKey: ["bridge-title", id],
    queryFn: () => getTitle({ data: { id } }),
  });
  const assetsQ = useQuery({
    queryKey: ["bridge-assets", id],
    queryFn: () => listTitleAssets({ data: { titleId: id } }),
  });
  const title = titleQ.data?.title;
  const poster = ["poster_vertical", "poster", "poster_horizontal", "thumbnail"]
    .map((kind) => (assetsQ.data?.assets ?? []).find((asset) => asset.verified && asset.kind === kind))
    .find(Boolean);
  const posterQ = useQuery({
    queryKey: ["title-poster", id, poster?.id],
    queryFn: () => openTitleAsset({ data: { assetId: poster!.id } }),
    enabled: Boolean(poster?.id),
  });

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (titleQ.isError) return <p role="alert">Title unavailable: {titleQ.error.message}</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

  const facts = [title.language, title.year ? String(title.year) : "", title.runtimeMinutes ? `${title.runtimeMinutes} min` : ""].filter(Boolean);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <section className="grid items-end gap-5 sm:grid-cols-[240px_minmax(0,1fr)]">
        <div className="aspect-[2/3] w-full max-w-[240px] overflow-hidden rounded-3xl border border-line bg-[#102433]">
          {posterQ.data?.url ? (
            <img src={posterQ.data.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-end p-4 text-lg font-semibold text-white">{title.name}</div>
          )}
        </div>
        <div className="min-w-0 pb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title.status}</p>
          <h1 className="mt-1 break-words font-display text-2xl font-semibold leading-tight sm:text-3xl">{title.name}</h1>
          {facts.length ? <p className="mt-2 break-words text-sm text-muted">{facts.join(" · ")}</p> : null}
        </div>
      </section>
      <SimpleDesk
        titleId={id}
        actor={actor}
        name={title.name}
        synopsis={title.synopsis || ""}
        status={title.status}
        language={title.language || ""}
        year={title.year}
        runtimeMinutes={title.runtimeMinutes}
        nameMl={title.nameMl || ""}
        country={title.countryOfOrigin || ""}
        releaseDate={title.releaseDate || ""}
        director={title.credits?.find((credit) => credit.role === "Director")?.name || ""}
        producer={title.credits?.find((credit) => credit.role === "Producer")?.name || ""}
        contentType={title.contentType || "Film"}
        seoTitle={titleQ.data?.seo?.title || ""}
        seoDescription={titleQ.data?.seo?.description || ""}
      />
    </div>
  );
}