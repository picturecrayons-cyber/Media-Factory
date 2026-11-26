import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { isStudioTestFixtureTitle } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio Home">
          <StudioHome userId={actor.userId} organizationId={actor.organizationId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StudioHome({ userId, organizationId }: { userId: string; organizationId?: string | null }) {
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", userId, organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = (titlesQ.data?.titles ?? []).filter((title) => !isStudioTestFixtureTitle(title));
  const pending = titles.filter((title) =>
    ["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(title.status),
  ).length;
  const recent = [...titles]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Your studio at a glance</h2>
          <p className="mt-1 text-sm text-muted">Manage titles, submissions and deliveries from one place.</p>
        </div>
        <Link to="/account" className="text-sm font-semibold text-accent hover:underline">Account settings →</Link>
      </section>

      <section aria-label="Studio overview" className="grid gap-3 sm:grid-cols-2">
        <Metric label="My titles" value={titlesQ.isPending || titlesQ.isError ? "—" : String(titles.length)} note="Verified records in this Studio workspace" />
        <Metric label="Pending actions" value={titlesQ.isPending || titlesQ.isError ? "—" : String(pending)} note="Upload, preparation, QC or rights stages" />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-semibold">Quick actions</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Action to="/submit-film" title="Submit Film" detail="Add a completed film" />
          <Action to="/submit-concept" title="Submit Story" detail="Add a story or concept" />
          <Action to="/workspace" title="My Titles" detail="View and manage titles" />
          <Action to="/deliveries" title="Deliveries" detail="Track authorized deliveries" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Recent titles</h3>
            <p className="text-sm text-muted">Only titles authorized for this Studio account are shown.</p>
          </div>
          <Link to="/workspace" className="shrink-0 text-sm font-semibold text-accent hover:underline">View all →</Link>
        </div>
        {titlesQ.isPending ? <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Loading Studio titles…</p> : null}
        {titlesQ.isError ? (
          <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
            <p>Studio titles could not be loaded. No totals are shown until the data source responds.</p>
            <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
          </div>
        ) : null}
        {!titlesQ.isPending && !titlesQ.isError ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link>
                  <p className="text-xs text-muted">{title.contentType ?? "Title"} · {title.language}{title.year ? ` · ${title.year}` : ""}</p>
                </div>
                <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{title.status.replaceAll("_", " ")}</span>
              </li>
            ))}
            {!recent.length ? <li className="px-4 py-8 text-center text-sm text-muted">No Studio titles are available yet. Start with Submit Film or Submit Story.</li> : null}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link to="/studio-dit" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
          <div><h3 className="font-semibold">Production & DIT</h3><p className="mt-1 text-sm text-muted">Open camera-card ingest and verification</p></div>
          <span aria-hidden="true" className="text-lg text-muted">→</span>
        </Link>
        <Link to="/account" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
          <div><h3 className="font-semibold">Account & Members</h3><p className="mt-1 text-sm text-muted">View account profile and verified access</p></div>
          <span aria-hidden="true" className="text-lg text-muted">→</span>
        </Link>
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </article>
  );
}

function Action({ to, title, detail }: { to: "/submit-film" | "/submit-concept" | "/workspace" | "/deliveries"; title: string; detail: string }) {
  return (
    <Link to={to} className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </Link>
  );
}
