import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles, listAuditLogs } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AdminControlPlane,
});

function AdminControlPlane() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        if (!isAdmin) {
          return (
            <BridgeShell actor={actor} title="Admin">
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-display text-xl font-semibold">Admin access required</h2>
                <p className="mt-2 max-w-xl text-sm text-muted">This private operations workspace is limited to Bridge administrators.</p>
              </section>
            </BridgeShell>
          );
        }
        return <AdminBody actor={actor} />;
      }}
    </RequireBridge>
  );
}

function AdminBody({ actor }: { actor: any }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const auditQ = useQuery({ queryKey: ["bridge-audit"], queryFn: () => listAuditLogs() });
  const distQ = useQuery({ queryKey: ["loop-publication-readiness"], queryFn: () => listLoopPublicationReadiness() });

  const titles = titlesQ.data?.titles ?? [];
  const distribution = distQ.data?.titles ?? [];
  const qcQueue = titles.filter((title) => title.status === "PREPARING" || title.status === "QC_REVIEW").length;
  const rightsQueue = titles.filter((title) => title.status === "RIGHTS_REVIEW").length;
  const buyerReady = titles.filter((title) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED"].includes(title.status)).length;
  const live = distribution.filter((title) => title.publication?.published).length;
  const attention = titles.filter((title) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(title.status)).slice(0, 8);

  const auditGroups = (auditQ.data?.logs ?? []).reduce((groups, log) => {
    const current = groups.get(log.action);
    if (current) {
      current.count += 1;
    } else {
      groups.set(log.action, { count: 1, latestAt: log.createdAt });
    }
    return groups;
  }, new Map<string, { count: number; latestAt: string }>());

  const titleValue = (value: number) => titlesQ.isPending ? "…" : titlesQ.isError ? "Unavailable" : String(value);
  const publicationValue = distQ.isPending ? "…" : distQ.isError ? "Unavailable" : String(live);

  return (
    <BridgeShell actor={actor} title="Founder & Admin operations">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Private control panel · StreamVista OPC PVT LTD</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Operations command</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">Direct the title pipeline, clear operational blockers and authorize commercial delivery only after the required Bridge gates pass.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/workstations" search={{ tab: "Titles" }}><Button>Open operations workstations</Button></Link>
            <Link to="/cms"><Button variant="outline">Open Bridge CMS</Button></Link>
          </div>
        </section>

        <section aria-label="Operational pipeline" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Canonical titles" value={titleValue(titles.length)} detail="Bridge title register" />
          <Metric label="QC & intake queue" value={titleValue(qcQueue)} detail="Preparation and technical review" />
          <Metric label="Rights decisions" value={titleValue(rightsQueue)} detail="Clearance requiring action" />
          <Metric label="Commercial pipeline" value={titleValue(buyerReady)} detail="Licensing-ready, live or negotiated" />
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Bridge → Loop publication control</h3>
            <span className="text-xs text-muted">Publication state, not a release certification</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CompactMetric label="Published Loop titles" value={publicationValue} />
            <CompactMetric label="Buyer-ready Bridge titles" value={titleValue(buyerReady)} />
          </div>
          {distQ.isError ? <p role="alert" className="mt-3 text-sm text-accent">Loop publication readiness is unavailable. No zero value is assumed.</p> : null}
          <p className="mt-3 text-xs text-muted">Bridge remains the authorization authority. Loop publication must revalidate rights, QC, legal, commercial and delivery gates.</p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold">Decision queue</h3>
              <p className="mt-1 text-sm text-muted">Titles currently in intake, QC, rights or licensing review.</p>
            </div>
            <Link to="/admin/workstations" search={{ tab: "Titles" }} className="text-sm font-semibold text-accent hover:underline">Open full queue →</Link>
          </div>
          <div className="mt-3 divide-y divide-line">
            {titlesQ.isPending ? <p className="py-5 text-sm text-muted">Loading operational queue…</p> : null}
            {titlesQ.isError ? <p role="alert" className="py-5 text-sm text-accent">The title queue could not be loaded. Retry before making an operational decision.</p> : null}
            {!titlesQ.isPending && !titlesQ.isError && attention.map((title) => (
              <div key={title.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{title.name}</p>
                  <span className="mt-1 inline-flex rounded-full border border-line px-2 py-0.5 text-xs text-muted">{title.status.replaceAll("_", " ").toLowerCase()}</span>
                </div>
                <Link to="/title/$id" params={{ id: title.id }} className="shrink-0 text-sm font-semibold text-accent hover:underline">Open decision record →</Link>
              </div>
            ))}
            {!titlesQ.isPending && !titlesQ.isError && attention.length === 0 ? <p className="py-5 text-sm text-muted">No titles are waiting in these decision states.</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Audit overview</h3>
              <p className="mt-1 text-sm text-muted">Recent activity grouped by action. Raw asset identifiers and duplicate event rows are intentionally omitted from this overview.</p>
            </div>
            <Link to="/admin/workstations" search={{ tab: "Titles" }} className="text-sm font-semibold text-accent hover:underline">Open audit workstation →</Link>
          </div>
          {auditQ.isPending ? <p className="py-4 text-sm text-muted">Loading audit summary…</p> : null}
          {auditQ.isError ? <p role="alert" className="py-4 text-sm text-accent">Audit summary is unavailable.</p> : null}
          {!auditQ.isPending && !auditQ.isError ? (
            <ul className="mt-3 divide-y divide-line">
              {Array.from(auditGroups.entries()).slice(0, 6).map(([action, group]) => (
                <li key={action} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-medium">{action.replaceAll(".", " ").replaceAll("_", " ")}</p>
                    <p className="text-xs text-muted">Most recent: {new Date(group.latestAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                  <span className="text-sm tabular-nums text-muted">{group.count} recent events</span>
                </li>
              ))}
              {auditGroups.size === 0 ? <li className="py-4 text-sm text-muted">No audit events found.</li> : null}
            </ul>
          ) : null}
        </section>
      </div>
    </BridgeShell>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3 py-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
