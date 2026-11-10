import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/studio")({ component: Studio });

const ACTIVE_STAGES = new Set(["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"]);
const LIVE_STAGES = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);

function Studio() {
  return <RequireBridge allow="studio">{(actor) => (
    <BridgeShell actor={actor} title="Studio dashboard"><StudioDashboard actor={actor} /></BridgeShell>
  )}</RequireBridge>;
}

function StudioDashboard({ actor }: { actor: { userId: string; organizationId: string | null } }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles", actor.userId, actor.organizationId], queryFn: () => listTitles(), retry: 1 });
  const titles = titlesQ.data?.titles ?? [];
  const active = titles.filter((title) => ACTIVE_STAGES.has(title.status));
  const live = titles.filter((title) => LIVE_STAGES.has(title.status));
  const ready = titles.filter((title) => title.status === "LICENSING_READY");

  return <div className="mx-auto max-w-6xl space-y-8 px-1 pb-16">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Crayons Bridge · Studio</p>
      <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">Studio production workspace</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">Manage your organization’s title pipeline and track production readiness. Team administration and DIT evidence are shown only when connected to verified records.</p>
    </header>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Production overview</h2>
      {titlesQ.isPending ? <p className="text-sm text-muted">Loading studio title records…</p> : null}
      {titlesQ.isError ? <div role="alert" className="rounded-sm border border-line p-4 text-sm">
        <p>Studio title records could not be loaded. Counts are hidden rather than estimated.</p>
        <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 underline">Retry</button>
      </div> : !titlesQ.isPending ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Organization titles" value={String(titles.length)} />
        <Metric label="In production / review" value={String(active.length)} />
        <Metric label="Licensing ready" value={String(ready.length)} />
        <Metric label="Live / licensed" value={String(live.length)} />
      </div> : null}
    </section>

    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <div className="space-y-4"><h2 className="text-lg font-semibold">Studio titles</h2><TitleList empty="No titles are assigned to this studio yet." /></div>
      <div className="space-y-4"><h2 className="text-lg font-semibold">New production intake</h2><NewSubmissionPanel /><MyStoryConcepts /></div>
    </section>

    <section className="grid gap-4 md:grid-cols-2">
      <article className="space-y-2 rounded-sm border border-line p-5">
        <h2 className="text-lg font-semibold">Organization & team</h2>
        <p className="text-sm text-muted">Studio title visibility is scoped through the server-resolved organization membership. Member invitations, role management and an auditable team roster are not yet exposed in this dashboard.</p>
        <p className="text-xs text-muted">Status: NOT VERIFIED</p>
      </article>
      <article className="space-y-2 rounded-sm border border-line p-5">
        <h2 className="text-lg font-semibold">DIT & media ingest</h2>
        <p className="text-sm text-muted">This dashboard does not yet expose an operational DIT agent for checksum manifests, independent replica verification, ingest retries or DIT sign-off.</p>
        <p className="text-xs text-muted">No 3-copy, checksum or sign-off badge is asserted without persisted evidence.</p>
        <p className="text-xs text-muted">Status: NOT VERIFIED</p>
      </article>
    </section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-sm border border-line bg-surface p-4"><p className="text-xs uppercase tracking-widest text-muted">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></article>;
}
