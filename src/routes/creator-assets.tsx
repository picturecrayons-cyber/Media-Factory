import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listCreatorAssetRegister, requestAssetDownload } from "@/lib/bridge/assets";

export const Route = createFileRoute("/creator-assets")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: CreatorAssets,
});

function CreatorAssets() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="My Assets & Uploads">
          <CreatorAssetsBody userId={actor.userId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function CreatorAssetsBody({ userId }: { userId: string }) {
  const assetsQ = useQuery({
    queryKey: ["bridge-creator-asset-register", userId],
    queryFn: () => listCreatorAssetRegister(),
    retry: 1,
  });
  const assets = assetsQ.data?.assets ?? [];

  async function download(assetId: string) {
    const signed = await requestAssetDownload({ data: { assetId } });
    window.open(signed.url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-1 pb-16">
      <header className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Creator · Secure media</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">My Assets & Uploads</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          This register contains only asset rows belonging to titles whose canonical Bridge owner is your
          authenticated account. Ownership claims do not expand this list or grant access to another account's files.
        </p>
      </header>

      {assetsQ.isPending ? <p className="text-sm text-muted">Loading your asset records…</p> : null}
      {assetsQ.isError ? (
        <section role="alert" className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm">Asset records could not be loaded. No zero counts are assumed.</p>
          <button type="button" onClick={() => void assetsQ.refetch()} className="mt-3 text-sm font-semibold text-accent underline">Retry</button>
        </section>
      ) : null}
      {!assetsQ.isPending && !assetsQ.isError && assets.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line p-6">
          <h2 className="font-semibold">No assets are recorded under your current title-owner scope</h2>
          <p className="mt-2 text-sm text-muted">
            A pending ownership claim does not make historical title assets visible. Continue the claim review process separately.
          </p>
        </section>
      ) : null}
      {assets.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-medium">{assets.length} asset record(s)</p>
            <p className="mt-1 text-xs text-muted">Object keys are withheld from this view. Downloads use the existing server authorization check.</p>
          </div>
          <ul className="divide-y divide-line">
            {assets.map((asset) => (
              <li key={asset.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                  <p className="font-medium">{asset.titleName}</p>
                  <p className="mt-1 text-xs text-muted">
                    {asset.kind.replaceAll("_", " ")} · {asset.contentType || "Content type not recorded"} · {asset.byteSize == null ? "Size pending" : `${(asset.byteSize / (1024 * 1024)).toFixed(1)} MB recorded`}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {asset.uploadedByCurrentUser ? "Uploaded by this account" : "Historical upload · original uploader attribution retained"}
                    {" · "}Record created {new Date(asset.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Metadata listing only; object integrity and version-specific restoration are not independently certified here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void download(asset.id).catch((error) => window.alert(error instanceof Error ? error.message : "Download is unavailable."))}
                  className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
                >
                  Request download
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
