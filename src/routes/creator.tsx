import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/creator")({ component: Creator });

const LIVE = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);
const IN_PROGRESS = new Set(["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"]);

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator workspace">
          <CreatorDashboard actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function CreatorDashboard({ actor }: { actor: { userId: string; organizationId?: string | null } }) {
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", actor.userId, actor.organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];
  const inProgress = titles.filter((title) => IN_PROGRESS.has(title.status));
  const licensingReady = titles.filter((title) => title.status === "LICENSING_READY");
  const live = titles.filter((title) => LIVE.has(title.status));
  const recent = [...titles].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 pb-16">
      <header className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Creator Desk</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your Creator Workspace</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">Submit a film or story and follow its review and authorized delivery status in one place.</p>
          </div>
          <Link to="/account" className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:border-accent">Account & access</Link>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <a href="#submissions" className="rounded-xl bg-bg p-3 text-sm font-semibold hover:ring-1 hover:ring-accent">My submissions <span className="block text-xs font-normal text-muted">Films, stories and status</span></a>
          <a href="#updates" className="rounded-xl bg-bg p-3 text-sm font-semibold hover:ring-1 hover:ring-accent">Review & delivery <span className="block text-xs font-normal text-muted">Corrections and delivery status</span></a>
          <a href="#documents" className="rounded-xl bg-bg p-3 text-sm font-semibold hover:ring-1 hover:ring-accent">Documents <span className="block text-xs font-normal text-muted">Private rights evidence</span></a>
        </div>
      </header>

      <section aria-label="Submission summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {titlesQ.isPending ? <p className="text-sm text-muted">Loading your submissions…</p> : null}
        {titlesQ.isError ? (
          <div role="alert" className="col-span-full rounded-xl border border-line p-4 text-sm">
            <p>Your submission summary is unavailable. No totals are shown until the account-scoped records load.</p>
            <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
          </div>
        ) : !titlesQ.isPending ? (
          <>
            <Metric label="My submissions" value={titles.length} />
            <Metric label="In progress" value={inProgress.length} />
            <Metric label="Licensing ready" value={licensingReady.length} />
            <Metric label="Licensed / delivered" value={live.length} />
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Start here</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">What would you like to submit?</h2>
          <p className="mt-1 text-sm text-muted">Choose one path. You can add detailed metadata and rights evidence after the initial record is created.</p>
        </div>
        <NewSubmissionPanel />
      </section>

      <section id="submissions" className="scroll-mt-20 space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Your catalogue</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">My Submissions</h2>
            <p className="mt-1 text-sm text-muted">Only records returned by the authenticated, server-scoped account query are shown.</p>
          </div>
        </div>
        <TitleList empty="No finished-film submissions yet. Use the submission options above to get started." />
        <div className="border-t border-line pt-4">
          <MyStoryConcepts />
        </div>
      </section>

      <section id="updates" className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Activity</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Latest submission activity</h2>
          </div>
          <Link to="/deliveries" className="text-sm font-semibold text-accent underline">Updates & deliveries</Link>
        </div>
        {titlesQ.isPending ? <p className="mt-3 text-sm text-muted">Loading updates…</p> : null}
        {titlesQ.isError ? <p className="mt-3 text-sm text-muted">Updates are unavailable while submissions cannot be loaded.</p> : null}
        {!titlesQ.isPending && !titlesQ.isError && recent.length ? (
          <ul className="mt-3 divide-y divide-line">
            {recent.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link>
                  <p className="text-xs text-muted">Updated {formatDate(title.updatedAt)}</p>
                </div>
                <StatusChip status={title.status} />
              </li>
            ))}
          </ul>
        ) : null}
        {!titlesQ.isPending && !titlesQ.isError && !recent.length ? <p className="mt-3 text-sm text-muted">No updates yet.</p> : null}
      </section>

      <section id="documents" className="scroll-mt-20 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <details>
          <summary className="cursor-pointer list-none font-semibold">
            <span className="flex items-center justify-between gap-3">Private Documents & Rights Evidence <span className="text-sm font-normal text-muted">Open vault ↓</span></span>
            <span className="mt-1 block text-sm font-normal text-muted">Upload signed documents once and link verified evidence to titles you own.</span>
          </summary>
          <div className="mt-4 border-t border-line pt-4"><CreatorDocumentVault /></div>
        </details>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <p>QC, Legal approval and publication remain separate authorized decisions. Buyer information is shown only when access is granted.</p>
        <Link to="/account" className="font-semibold hover:text-fg">Manage account →</Link>
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p></article>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "date unavailable" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
