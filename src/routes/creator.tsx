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

const SECTIONS = [
  ["Overview", "#overview"],
  ["My titles", "#my-titles"],
  ["New title", "#add-title"],
  ["Metadata", "#metadata"],
  ["Rights", "#rights"],
  ["Assets", "#assets"],
  ["Review", "#review"],
  ["Delivery", "#delivery"],
  ["Statements", "#statements"],
] as const;

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
    <div className="mx-auto w-full max-w-[1440px] space-y-7 px-4 pb-16 pt-5 sm:px-6 sm:pt-7 lg:px-8">
      <header id="overview" className="relative isolate overflow-hidden rounded-[28px] border border-line bg-surface shadow-sm">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] lg:items-end lg:p-10">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Crayons Bridge <span className="text-muted">/</span> Creator Desk
            </p>
            <h1 className="mt-5 max-w-2xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-[2.8rem]">
              Your films. Your rights. Your workspace.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
              One clear place to prepare your titles, manage ownership information, respond to review
              feedback and follow delivery after Bridge authorization.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#add-title" className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg shadow-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                + Add new title
              </a>
              <Link to="/account" className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-bg/60 px-5 py-2.5 text-sm font-semibold transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Account & access <span aria-hidden="true" className="ml-2">↗</span>
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-bg/70 p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your workflow</p>
            <ol className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["01", "Submit", "Create a title record"],
                ["02", "Prepare", "Add details and assets"],
                ["03", "Review", "Follow QC and rights feedback"],
                ["04", "Deliver", "Track authorized delivery"],
              ].map(([number, label, description], index) => (
                <li key={number} className="relative min-h-[104px] rounded-xl border border-line bg-surface p-3">
                  <span className="text-[11px] font-bold tabular-nums text-accent">{number}</span>
                  <p className="mt-2 text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
                  {index < 3 ? <span aria-hidden="true" className="absolute right-3 top-3 text-xs text-muted">→</span> : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </header>

      <nav aria-label="Creator workspace sections" className="sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto border-y border-line bg-bg/95 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {SECTIONS.map(([label, href]) => (
          <a key={href} href={href} className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold text-muted transition hover:bg-surface hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:text-sm">
            {label}
          </a>
        ))}
      </nav>

      <section aria-labelledby="snapshot-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent">At a glance</p>
            <h2 id="snapshot-heading" className="mt-1 font-display text-2xl font-semibold">Your title activity</h2>
          </div>
          <span className="text-xs text-muted">Authenticated Creator account · server-scoped records</span>
        </div>
        {titlesQ.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading title summary" aria-busy="true">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl border border-line bg-surface" />)}
          </div>
        ) : titlesQ.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
            <div>
              <p className="font-semibold">Your title summary is unavailable</p>
              <p className="mt-1 text-sm text-muted">We could not retrieve your records. No totals are shown until the account-scoped data source responds.</p>
            </div>
            <button type="button" onClick={() => void titlesQ.refetch()} className="min-h-10 rounded-full border border-line-strong px-4 text-sm font-semibold hover:border-accent">Retry</button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="My titles" value={titles.length} note="Records returned for your account" tone="accent" />
            <Metric label="In progress" value={inProgress.length} note="Upload, preparation, QC or rights review" />
            <Metric label="Licensing ready" value={licensingReady.length} note="At the licensing-ready stage" />
            <Metric label="Live / licensed" value={live.length} note="Buyer-facing or licensed lifecycle records" />
          </div>
        )}
      </section>

      <section id="my-titles" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent">Your catalogue</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">My Titles</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Only records returned by the authenticated, server-scoped Creator title query appear here.</p>
          </div>
          <a href="#add-title" className="inline-flex min-h-10 items-center rounded-full border border-line-strong px-4 py-2 text-sm font-semibold transition hover:border-accent">+ New title</a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <TitleList empty="No titles are available for this account yet. Start a submission to add your first title." />
        </div>
      </section>

      <section id="add-title" className="scroll-mt-24 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent">Create a title record</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">Add New Title</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Submit a finished film through the existing Bridge form. Submission creates a record; it does
            not approve QC, ownership, licensing or publication.
          </p>
          <div className="mt-5"><NewSubmissionPanel /></div>
        </div>
        <aside className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted">Separate submission path</p>
          <h3 className="mt-2 font-display text-xl font-semibold">Story & Concept</h3>
          <p className="mt-2 text-sm leading-6 text-muted">Keep early story concepts separate from finished-film title records. A concept is not a finished film or a license-ready asset.</p>
          <div className="mt-5"><MyStoryConcepts /></div>
        </aside>
      </section>

      <section aria-label="Title management tools" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoPanel id="metadata" eyebrow="Title workspace" title="Metadata & Credits" description="Review and update the metadata and credits fields currently enabled for your title." action="Open My Titles" href="#my-titles" />
        <InfoPanel id="rights" eyebrow="Ownership evidence" title="Rights & Ownership" description="Provide ownership and authorization information where requested. Attestations do not replace signed chain-of-title documents or Legal verification." action="Review title records" href="#my-titles" />
        <InfoPanel id="review" eyebrow="QC & feedback" title="Review & Corrections" description="Track the current review stage and open your record for available feedback. Creator accounts cannot approve QC or Legal decisions." action="View title status" href="#my-titles" />
        <InfoPanel id="delivery" eyebrow="Release control" title="Delivery Status" description="Delivery appears only after the required Bridge authorization. Submission or upload alone does not publish a title to Loop or buyers." action="View authorized records" href="#my-titles" />
      </section>

      <section id="assets" className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent">Secure media</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">My Assets & Uploads</h2>
          </div>
          <span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted">Title-scoped access</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
          Uploads, verified file details, processing progress and asset versions remain inside each title's secure workspace. No file sizes, resolutions, upload percentages or completion states are invented when a verified asset feed is unavailable.
        </p>
        <a href="#my-titles" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-accent hover:underline">Open a title's asset workspace <span aria-hidden="true" className="ml-2">→</span></a>
      </section>

      <section id="updates" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent">Activity</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Recent Title Updates</h2>
          </div>
          <span className="text-xs text-muted">Latest 5 records</span>
        </div>
        {titlesQ.isPending ? (
          <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">Loading recent title updates…</p>
        ) : titlesQ.isError ? (
          <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">Updates are unavailable while title records cannot be loaded.</p>
        ) : recent.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {recent.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <Link to="/title/$id" params={{ id: title.id }} className="font-semibold hover:text-accent">{title.name}</Link>
                  <p className="mt-1 text-xs text-muted">Updated {formatDate(title.updatedAt)}</p>
                </div>
                <StatusChip status={title.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No title updates yet.</p>
        )}
      </section>

      <section id="statements" className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted">Creator finance</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="font-display text-2xl font-semibold">Statements</h2>
            <p className="mt-2 text-sm leading-7 text-muted">Creator earnings, commissions, adjustments and downloadable statements are shown only when verified creator-payable ledger and reconciliation data are available. Title licensing values are not treated as creator earnings.</p>
          </div>
          <span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted">NOT VERIFIED · No statement feed connected</span>
        </div>
      </section>

      <footer className="flex flex-col gap-3 border-t border-line pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Creator access is limited to your own authorized records. QC, Legal and publishing approvals remain separate.</p>
        <Link to="/account" className="font-semibold text-fg hover:text-accent">Manage account <span aria-hidden="true">→</span></Link>
      </footer>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: number;
  note: string;
  tone?: "default" | "accent";
}) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        {tone === "accent" ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" /> : null}
      </div>
      <p className="mt-4 font-display text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{note}</p>
    </article>
  );
}

function InfoPanel({
  id,
  eyebrow,
  title,
  description,
  action,
  href,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  href: string;
}) {
  return (
    <article id={id} className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 font-display text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      <a href={href} className="mt-4 inline-flex min-h-9 items-center text-sm font-semibold text-accent hover:underline">{action} <span aria-hidden="true" className="ml-2">→</span></a>
    </article>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date unavailable"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
