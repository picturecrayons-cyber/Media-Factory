import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { listTitleAssets, requestAssetDownload } from "@/lib/bridge/assets";
import { selectVerifiedOriginalPoster } from "@/lib/bridge/title-gallery-model";
import { listTitles } from "@/lib/bridge/titles";

type LibraryStatus = "all" | "draft" | "preparing" | "uploading" | "live for buyers";

function TitlePoster({ titleId, titleName }: { titleId: string; titleName: string }) {
  const assetsQ = useQuery({
    queryKey: ["bridge-title-poster-assets", titleId],
    queryFn: () => listTitleAssets({ data: { titleId } }),
    staleTime: 60_000,
    // Retry once for transient Preview/API failures; refocus refreshes stale status.
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const poster = selectVerifiedOriginalPoster(assetsQ.data?.assets ?? []);
  const previewQ = useQuery({
    queryKey: ["bridge-title-poster-preview", poster?.id],
    queryFn: () => requestAssetDownload({ data: { assetId: poster!.id } }),
    enabled: Boolean(poster?.verified && poster.contentType?.startsWith("image/")),
    staleTime: 4 * 60_000,
    // Signed-preview requests can fail transiently; retry once and refresh on focus.
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = previewQ.data?.url;
  const imageFailed = Boolean(src && failedSrc === src);
  const posterMessage = assetsQ.isError
    ? "Could not load poster status"
    : previewQ.isError || imageFailed
      ? "Verified poster preview unavailable"
      : "Original poster unavailable";

  return (
    <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-line bg-elevated" aria-label={`Poster for ${titleName}`}>
      {src && !imageFailed ? (
        <img src={src} alt={`${titleName} original poster`} loading="lazy" className="h-full w-full object-cover" onError={() => setFailedSrc(src ?? null)} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center text-xs text-muted" role={assetsQ.isError || previewQ.isError || imageFailed ? "status" : undefined}>
          <span aria-hidden="true" className="text-3xl leading-none">▧</span>
          <span>{assetsQ.isPending || Boolean(poster && previewQ.isPending) ? "Loading poster…" : posterMessage}</span>
        </div>
      )}
    </div>
  );
}

export function TitleGallery({ query = "", status = "all" }: { query?: string; status?: LibraryStatus }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const normalizedQuery = query.trim().toLowerCase();
  const titles = (titlesQ.data?.titles ?? []).filter((title) => {
    const matchesQuery = !normalizedQuery || `${title.name} ${title.language} ${title.year ?? ""} ${title.contentType ?? ""}`.toLowerCase().includes(normalizedQuery);
    const normalizedStatus = String(title.status).toLowerCase().replaceAll("_", " ");
    return matchesQuery && (status === "all" || normalizedStatus === status);
  });

  if (titlesQ.isPending) return <p className="py-10 text-center text-sm text-muted">Loading titles…</p>;
  if (titlesQ.isError) {
    return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-accent"><p>Could not load titles.</p><Button type="button" onClick={() => void titlesQ.refetch()}>Retry</Button></div>;
  }
  if (!titles.length) return <p className="py-12 text-center text-sm text-muted">No titles match your search.</p>;

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-9">
      {titles.map((title) => {
        const isInternalTest = title.name.toUpperCase().includes("INTERNAL TEST ONLY");
        return (
          <li key={title.id} className="min-w-0">
            <Link to="/title/$id" params={{ id: title.id }} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4">
              <div className="relative">
                <TitlePoster titleId={title.id} titleName={title.name} />
                {isInternalTest ? <span className="absolute left-2 top-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">Test only</span> : null}
              </div>
              <div className="pt-3">
                <p className="line-clamp-2 min-h-12 text-sm font-semibold leading-6 text-fg group-hover:text-accent sm:text-base">{title.name}</p>
                <p className="mt-1 min-h-5 text-xs text-muted">{[title.language, title.year].filter(Boolean).join(" · ") || title.contentType || "Film"}</p>
                <div className="mt-3"><StatusChip status={title.status} /></div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export type { LibraryStatus };
