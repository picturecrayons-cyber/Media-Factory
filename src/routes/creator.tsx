import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/creator")({ component: Creator });

const IN_PROGRESS = new Set(["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"]);
const LICENSING_READY = new Set(["LICENSING_READY"]);
const LIVE = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator Home">
          <CreatorHome userId={actor.userId} organizationId={actor.organizationId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function CreatorHome({ userId, organizationId }: { userId: string; organizationId?: string | null }) {
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", userId, organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];
  const recent = [...titles].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Creator workspace</p>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Your titles, rights and submissions</h2>
          <p className="mt-1 text-sm text-muted">Track your own title records and the next action in each workflow.</p>
        </div>
        <Link to="/account" className="text-sm font-semibold text-accent hover:underline">Account & access →</Link>
      </header>

      <section aria-label="Creator overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="My titles" value={titlesQ.isPending || titlesQ.isError ? "—" : String(titles.length)} />
        <Metric label="In progress" value={titlesQ.isPending || titlesQ.isError ? "—" : String(titles.filter((title) => IN_PROGRESS.has(title.status)).length)} />
        <Metric label="Licensing ready" value={titlesQ.isPending || titlesQ.isError ? "—" : String(titles.filter((title) => LICENSING_READY.has(title.status)).length)} />
        <Metric label="Live / licensed" value={titlesQ.isPending || titlesQ.isError ? "—" : String(titles.filter((title) => LIVE.has(title.status)).length)} />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-semibold">Your Bridge products and workspace</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Action to="/submit-film" title="Finished Films" detail="Submit and manage completed film records" />
          <Action to="/submit-concept" title="Stories / Concepts" detail="Submit and manage development-stage projects" />
          <Action to="/workspace" title="Product Library" detail="Open canonical Film and Story records" />
          <Action to="/deliveries" title="Deliveries" detail="Track authorized deliveries" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Recent product records</h3>
            <p className="text-sm text-muted">Records returned by your authenticated Creator account.</p>
          </div>
          <Link to="/workspace" className="shrink-0 text-sm font-semibold text-accent hover:underline">View all →</Link>
        </div>
        {titlesQ.isPending ? <p role="status" className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Loading your titles…</p> : null}
        {titlesQ.isError ? (
          <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
            <p>Title records could not be loaded. No totals are shown.</p>
            <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
          </div>
        ) : null}
        {!titlesQ.isPending && !titlesQ.isError ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link>
                  <p className="text-xs text-muted">{title.submissionType === "story_concept" ? "Story / Concept" : "Finished Film"} · {title.contentType ?? "Title"} · {title.language}{title.year ? ` · ${title.year}` : ""}</p>
                </div>
                <StatusChip status={title.status} />
              </li>
            ))}
            {!recent.length ? <li className="px-4 py-8 text-center text-sm text-muted">No title records yet. Start with Submit Film or Submit Story.</li> : null}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">My story concepts</summary>
          <div className="mt-3"><MyStoryConcepts /></div>
        </details>
        <Link to="/account" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
          <div><h3 className="font-semibold">Account & access</h3><p className="mt-1 text-sm text-muted">Profile and account settings</p></div>
          <span aria-hidden="true" className="text-lg text-muted">→</span>
        </Link>
      </section>

      <p className="border-t border-line pt-4 text-xs text-muted">Creator access is limited to your own authorized records. QC, Legal, Rights and publishing approvals remain separate.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
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
