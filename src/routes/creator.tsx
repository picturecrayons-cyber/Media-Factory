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

function CreatorDashboard({
  actor,
}: {
  actor: { userId: string; organizationId?: string | null };
}) {
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", actor.userId, actor.organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];
  const inProgress = titles.filter((title) => IN_PROGRESS.has(title.status));
  const licensingReady = titles.filter((title) => title.status === "LICENSING_READY");
  const live = titles.filter((title) => LIVE.has(title.status));
  const recent = [...titles]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1 pb-12">
      <header id="overview" className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Crayons Bridge · Creator Desk
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Your films. Your workspace.
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Manage your titles, assets, rights reviews and authorized deliveries.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to="/account"
            className="inline-flex min-h-10 items-center rounded-full border border-line-strong px-4 py-2 text-sm font-semibold transition hover:border-accent"
          >
            Account & access
          </Link>
          <a href="#add-title" className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90">
            + Add a title
          </a>
        </div>
      </header>

      <nav aria-label="Creator workspace navigation" className="flex flex-wrap gap-2">
        {[["Overview", "#overview"], ["My titles", "#my-titles"], ["Add title", "#add-title"], ["More", "#workspace-tools"]].map(([label, href]) => (
          <a key={href} href={href} className="rounded-full border border-line px-3 py-2 text-xs font-medium text-muted transition hover:border-accent hover:text-fg">
            {label}
          </a>
        ))}
      </nav>

      <section aria-label="Creator title overview" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">Your overview</h2>
          <span className="text-xs text-muted">Your authenticated account · up to 200 records</span>
        </div>
        {titlesQ.isPending ? <p className="text-sm text-muted">Loading your titles…</p> : null}
        {titlesQ.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
            <p>Title records could not be loaded. Totals are hidden until the data source responds.</p>
            <button type="button" onClick={() => void titlesQ.refetch()} className="font-semibold text-accent underline">
              Retry
            </button>
          </div>
        ) : !titlesQ.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="My titles" value={titles.length} />
            <Metric label="In progress" value={inProgress.length} />
            <Metric label="Licensing ready" value={licensingReady.length} />
            <Metric label="Live / licensed" value={live.length} />
          </div>
        ) : null}
      </section>

      <section id="my-titles" className="scroll-mt-20 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Your catalogue</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">My Titles</h2>
            <p className="mt-1 text-sm text-muted">Only titles returned by your authenticated Creator account are shown.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <TitleList empty="No titles yet. Add your first title to begin." />
        </div>
      </section>

      <section id="add-title" className="scroll-mt-20 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Start a submission</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Add New Title</h2>
          <p className="mt-1 text-sm text-muted">
            A submission creates a draft record. QC, ownership, licensing and publication approvals remain separate.
          </p>
        </div>
        <NewSubmissionPanel />
        <MyStoryConcepts />
      </section>

      <section id="workspace-tools" className="scroll-mt-20 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Workspace tools</p>
          <h2 className="mt-1 font-display text-xl font-semibold">More from your workspace</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <InfoPanel id="metadata" title="Metadata & credits" description="Review and update the fields enabled for your title." href="#my-titles" />
          <InfoPanel id="rights" title="Rights & ownership" description="Provide ownership evidence for Legal review. Attestations do not replace signed documents." href="#my-titles" />
          <InfoPanel id="assets" title="Assets & uploads" description="Open a title to manage secure uploads, verified file details and asset versions." href="#my-titles" />
          <InfoPanel id="review" title="Review & corrections" description="Track QC and rights feedback. Creator accounts cannot approve QC or Legal decisions." href="#my-titles" />
          <InfoPanel id="delivery" title="Delivery status" description="Delivery appears only after required Bridge authorization. Upload does not publish to Loop." href="#my-titles" />
          <InfoPanel id="statements" title="Statements" description="Creator-payable statements appear only when verified ledger and reconciliation data are connected." href="#my-titles" note="NOT VERIFIED · No statement feed" />
        </div>
      </section>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Recent title activity</summary>
        <div className="border-t border-line p-4">
          {titlesQ.isPending ? (
            <p className="text-sm text-muted">Loading recent updates…</p>
          ) : titlesQ.isError ? (
            <p className="text-sm text-muted">Updates unavailable while title records cannot be loaded.</p>
          ) : recent.length ? (
            <ul className="divide-y divide-line">
              {recent.map((title) => (
                <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link>
                    <p className="text-xs text-muted">Updated {formatDate(title.updatedAt)}</p>
                  </div>
                  <StatusChip status={title.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No title updates yet.</p>
          )}
        </div>
      </details>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted">
        <p>Your records remain account-scoped. QC, Legal and publishing approvals are separate.</p>
        <Link to="/account" className="font-semibold hover:text-fg">Manage account →</Link>
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}

function InfoPanel({
  id,
  title,
  description,
  href,
  note,
}: {
  id: string;
  title: string;
  description: string;
  href: string;
  note?: string;
}) {
  return (
    <article id={id} className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      {note ? <p className="mt-3 text-[11px] font-semibold text-muted">{note}</p> : null}
      <a href={href} className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open titles →</a>
    </article>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date unavailable"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
