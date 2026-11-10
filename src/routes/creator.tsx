import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/creator")({ component: Creator });

const LIVE = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);
const IN_PROGRESS = new Set(["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"]);

function Creator() {
  return <RequireBridge allow="creator">{(actor) => (
    <BridgeShell actor={actor} title="Creator dashboard"><CreatorDashboard actor={actor} /></BridgeShell>
  )}</RequireBridge>;
}

function CreatorDashboard({ actor }: { actor: { userId: string; organizationId: string | null } }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles", actor.userId, actor.organizationId], queryFn: () => listTitles(), retry: 1 });
  const titles = titlesQ.data?.titles ?? [];
  const live = titles.filter((t) => LIVE.has(t.status));
  const progress = titles.filter((t) => IN_PROGRESS.has(t.status));
  const ready = titles.filter((t) => t.status === "LICENSING_READY");
  const recent = [...titles].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);

  return <div className="mx-auto max-w-6xl space-y-8 px-1 pb-16">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Crayons Bridge · Creator</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">Your creator workspace</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Track your titles from submission through QC, rights review and buyer licensing.</p>
      </div>
      <Link to="/account" className="rounded-sm border border-line px-4 py-2 text-sm hover:border-accent">Account & privacy</Link>
    </header>

    <nav aria-label="Creator dashboard sections" className="flex flex-wrap gap-2 border-b border-line pb-4 text-sm">
      {[["Overview","#overview"],["My titles","#titles"],["Performance","#performance"],["Statements","#statements"],["Channels","#channels"],["Updates","#updates"],["Schedule","#schedule"]].map(([label, href]) =>
        <a key={href} href={href} className="rounded-sm px-3 py-2 text-muted hover:bg-surface hover:text-fg">{label}</a>)}
    </nav>

    <section id="overview" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Overview</h2><span className="text-xs text-muted">Live records · your account scope</span>
      </div>
      {titlesQ.isPending ? <p className="text-sm text-muted">Loading your title records…</p> : null}
      {titlesQ.isError ? <div role="alert" className="rounded-sm border border-line p-4 text-sm">
        <p>Title records could not be loaded. Dashboard totals are hidden until the data source responds.</p>
        <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 underline">Retry</button>
      </div> : !titlesQ.isPending ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="My titles" value={String(titles.length)} note="Owned or assigned title records" />
        <Metric label="In progress" value={String(progress.length)} note="Upload, preparation, QC or rights review" />
        <Metric label="Licensing ready" value={String(ready.length)} note="Passed into licensing-ready stage" />
        <Metric label="Live / licensed" value={String(live.length)} note="Buyer-facing or licensed lifecycle records" />
      </div> : null}
    </section>

    <section id="titles" className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">My titles</h2><Link to="/workspace" className="text-sm text-muted hover:text-fg">Open title workspace</Link></div>
        <TitleList empty="No titles are recorded for this account yet. Start a submission to begin." />
      </div>
      <div className="space-y-4"><h2 className="text-lg font-semibold">Submit a title</h2><NewSubmissionPanel /><MyStoryConcepts /></div>
    </section>

    <section id="performance" className="space-y-3 rounded-sm border border-line p-5">
      <h2 className="text-lg font-semibold">Performance · Past 6 months</h2>
      <p className="text-sm text-muted">Earnings, gross estimates and channel performance are not shown because a verified creator-finance reporting feed is not connected. Title licensing fees are not creator earnings.</p>
      <div className="grid gap-3 sm:grid-cols-3"><UnavailableMetric label="Gross estimates" /><UnavailableMetric label="Gross earnings" /><UnavailableMetric label="Top channels" /></div>
    </section>

    <section id="statements" className="space-y-2 rounded-sm border border-line p-5">
      <h2 className="text-lg font-semibold">Statements</h2>
      <p className="text-sm text-muted">Commissions, refunds, adjustments and downloadable statements require verified creator-payable ledger entries and statement generation. No financial figures are inferred from title data.</p>
      <p className="text-xs text-muted">NOT VERIFIED · no downloadable statement is presented.</p>
    </section>

    <section id="channels" className="space-y-2 rounded-sm border border-line p-5">
      <h2 className="text-lg font-semibold">Channels</h2>
      <p className="text-sm text-muted">No verified channel-performance feed is connected. Distribution destinations and buyer licensing status remain on each title record.</p>
    </section>

    <section id="updates" className="space-y-3">
      <h2 className="text-lg font-semibold">Recent title updates</h2>
      {titlesQ.isPending ? <p className="text-sm text-muted">Loading updates…</p> : titlesQ.isError ? <p className="text-sm text-muted">Updates unavailable while title records cannot be loaded.</p> : recent.length ? <ul className="divide-y divide-line rounded-sm border border-line">
        {recent.map((title) => <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div><Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link><p className="text-xs text-muted">Updated {formatDate(title.updatedAt)}</p></div>
          <StatusChip status={title.status} />
        </li>)}
      </ul> : <p className="rounded-sm border border-line p-4 text-sm text-muted">No title updates yet.</p>}
    </section>

    <section id="schedule" className="space-y-2 rounded-sm border border-line p-5">
      <h2 className="text-lg font-semibold">Schedule</h2><p className="text-sm text-muted">No verified creator scheduling or delivery-calendar feed is connected yet.</p>
    </section>
  </div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rounded-sm border border-line bg-surface p-4"><p className="text-xs uppercase tracking-widest text-muted">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></article>;
}
function UnavailableMetric({ label }: { label: string }) {
  return <article className="rounded-sm border border-line p-3"><p className="text-xs uppercase tracking-widest text-muted">{label}</p><p className="mt-2 text-xl font-semibold">Not verified</p><p className="mt-1 text-xs text-muted">No trusted source</p></article>;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "date unavailable" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
