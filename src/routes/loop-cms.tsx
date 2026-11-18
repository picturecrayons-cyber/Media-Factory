import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listLoopCmsGovernanceSnapshot } from "@/lib/bridge/loop-publication";

export const Route = createFileRoute("/loop-cms")({ component: LoopCmsGovernance });

function LoopCmsGovernance() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Crayons Loop CMS governance">
          <LoopCmsBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function LoopCmsBody() {
  const snapshotQ = useQuery({
    queryKey: ["loop-cms-governance-snapshot"],
    queryFn: () => listLoopCmsGovernanceSnapshot(),
    retry: false,
  });
  const titles = snapshotQ.data?.titles ?? [];
  const mapped = titles.filter((title) => title.publication);
  const published = mapped.filter((title) => title.publication?.published);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Loop consumer platform · governance view</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">Publication and catalogue oversight</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              Read-only view of Bridge-to-Loop publication mappings and current catalogue flags. This is not yet the full consumer merchandising editor.
            </p>
          </div>
          <Link to="/cms" search={{ tab: "publishing" }} className="text-sm font-semibold text-accent hover:underline">Open Bridge publication gateway →</Link>
          <Link to="/loop-merchandising" className="text-sm font-semibold text-accent hover:underline">Open homepage merchandising editor →</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Loop publication summary">
        <Metric label="Bridge titles in snapshot" value={snapshotQ.isSuccess ? String(titles.length) : "—"} />
        <Metric label="Mapped to Loop" value={snapshotQ.isSuccess ? String(mapped.length) : "—"} />
        <Metric label="Currently published" value={snapshotQ.isSuccess ? String(published.length) : "—"} />
      </section>

      {snapshotQ.isPending ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading Loop publication records…</p>
      ) : snapshotQ.isError ? (
        <p role="alert" className="rounded-xl border border-line p-5 text-sm text-accent">
          Loop publication data is unavailable. No empty catalogue or zero count is assumed.
        </p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-line">
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <h3 className="font-semibold">Bridge → Loop title mappings</h3>
            <p className="mt-1 text-xs text-muted">Up to 200 most recently updated Bridge titles. No mutation controls are exposed here.</p>
          </div>
          <div className="divide-y divide-line">
            {titles.map((title) => (
              <article key={title.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <div className="min-w-0">
                  <h4 className="truncate font-medium">{title.name}</h4>
                  <p className="mt-1 text-xs text-muted">Bridge: {title.bridgeStatus.replaceAll("_", " ")} · {title.language}</p>
                  {title.publication ? (
                    <p className="mt-1 text-xs text-muted">
                      Loop: {title.publication.loopStatus ?? "status unavailable"} · {title.publication.territories.join(", ") || "territory not recorded"} · {title.publication.exploitationModels.join(", ") || "model not recorded"}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">No Loop publication mapping recorded.</p>
                  )}
                  {title.publication?.windowStart || title.publication?.windowEnd ? (
                    <p className="mt-1 text-xs text-muted">Window: {title.publication.windowStart ?? "open"} → {title.publication.windowEnd ?? "open"}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <StatePill label={title.publication ? title.publication.authorizationStatus : "not mapped"} />
                  {title.publication ? <StatePill label={title.publication.published ? "published" : "not published"} /> : null}
                  {title.publication?.listed ? <StatePill label="listed" /> : null}
                  <Link to="/title/$id" params={{ id: title.id }} className="text-xs font-semibold text-accent hover:underline">Open Bridge title →</Link>
                </div>
              </article>
            ))}
            {!titles.length ? <p className="px-4 py-8 text-center text-sm text-muted">No Bridge title records were returned by this query.</p> : null}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Independent release gates</h3>
        <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>• Bridge QC and asset readiness remain mandatory.</li>
          <li>• Rights grants and independent Legal approval remain mandatory.</li>
          <li>• Publication authorization is not payment verification.</li>
          <li>• TVOD/SVOD entitlement is not granted by this dashboard.</li>
          <li>• Playback access remains controlled by Loop entitlement and playback services.</li>
          <li>• This snapshot is read-only and does not expire, publish, unlist or edit records.</li>
        </ul>
      </section>

      <p className="text-xs text-muted">
        Scope note: this is the first Loop CMS governance slice. Consumer homepage merchandising, banners, collections, scheduling and editorial content editing are not exposed until their own audited service contracts and permissions are implemented.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}

function StatePill({ label }: { label: string }) {
  return <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">{label.replaceAll("_", " ")}</span>;
}
