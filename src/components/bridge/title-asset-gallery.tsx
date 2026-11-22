import { useQueries, useQuery } from "@tanstack/react-query";
import { listTitleAssets, requestAssetDownload } from "@/lib/bridge/assets";
import { listTitles } from "@/lib/bridge/titles";

type GalleryAsset = {
  id: string;
  kind: string;
  contentType: string | null;
  byteSize: number | null;
  verified: boolean;
  createdAt: string;
  url: string;
};

const IMAGE_KINDS = new Set(["poster", "poster_vertical", "poster_horizontal", "thumbnail"]);

export function TitleAssetGallery({ userId, scopeLabel }: { userId: string; scopeLabel: string }) {
  const titlesQ = useQuery({
    queryKey: ["bridge-gallery-titles", userId, scopeLabel],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = (titlesQ.data?.titles ?? []).slice(0, 12);
  const assetQueries = useQueries({
    queries: titles.map((title) => ({
      queryKey: ["bridge-gallery-assets", userId, scopeLabel, title.id],
      queryFn: async (): Promise<GalleryAsset[]> => {
        const result = await listTitleAssets({ data: { titleId: title.id } });
        const candidates = result.assets
          .filter((asset) => IMAGE_KINDS.has(asset.kind) && asset.contentType?.toLowerCase().startsWith("image/"))
          .slice(0, 4);
        const signed = await Promise.allSettled(
          candidates.map(async (asset) => {
            const download = await requestAssetDownload({ data: { assetId: asset.id } });
            return {
              id: asset.id,
              kind: asset.kind,
              contentType: asset.contentType,
              byteSize: asset.byteSize,
              verified: asset.verified,
              createdAt: asset.createdAt,
              url: download.url,
            };
          }),
        );
        return signed.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
      },
      retry: 1,
      staleTime: 60_000,
    })),
  });

  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading your authorized gallery…</p>;
  if (titlesQ.isError) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-muted"><p>Gallery titles could not be loaded.</p><button type="button" onClick={() => void titlesQ.refetch()} disabled={titlesQ.isFetching} className="font-semibold text-accent underline">{titlesQ.isFetching ? "Retrying…" : "Retry"}</button></div>;
  if (!titles.length) return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No authorized titles are available for this gallery yet.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Showing up to 12 titles from the server-authorized {scopeLabel} catalogue. Only verified image assets are previewed; masters, technical packages and private documents are excluded.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {titles.map((title, index) => {
          const query = assetQueries[index];
          const assets = query?.data ?? [];
          return (
            <article key={title.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="grid min-h-40 grid-cols-2 gap-px bg-line">
                {assets.length ? assets.slice(0, 4).map((asset) => (
                  <img key={asset.id} src={asset.url} alt={`${title.name} — ${asset.kind.replaceAll("_", " ")}`} loading="lazy" className="h-40 w-full bg-bg object-cover" />
                )) : (
                  <div className="col-span-2 grid min-h-40 place-items-center bg-bg px-4 text-center text-xs text-muted">
                    {query?.isPending ? "Loading approved artwork…" : query?.isError ? "Artwork is temporarily unavailable." : "No verified poster / artwork assets yet."}
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                <h3 className="font-semibold">{title.name}</h3>
                <p className="text-xs text-muted">{assets.length} verified image asset{assets.length === 1 ? "" : "s"} · title-scoped access</p>
                {assets.length ? <p className="text-[11px] text-muted">Latest asset: {new Date(assets[0]!.createdAt).toLocaleDateString("en-IN")}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
