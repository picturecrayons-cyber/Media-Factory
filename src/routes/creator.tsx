import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listTitles } from "@/lib/bridge/titles";
import { MediaWorkspaceDesk } from "@/components/bridge/media-workspace-desk";

export const Route = createFileRoute("/creator")({ component: Creator });

const LIVE = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);
const IN_PROGRESS = new Set(["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"]);

const SECTIONS = [
  ["Overview", "#overview"],
  ["My Titles", "#my-titles"],
  ["Add New Title", "#add-title"],
  ["Metadata & Credits", "#metadata"],
  ["Rights & Ownership", "#rights"],
  ["Storage / Media Vault", "#assets"],
  ["Post-Production", "#post-production"],
  ["Review & Corrections", "#review"],
  ["Delivery Status", "#delivery"],
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
    <div className="mx-auto max-w-7xl space-y-7 px-1 pb-16">
      <header
        id="overview"
        className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 sm:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-accent/10 to-transparent"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Crayons Bridge · Creator Desk
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Your films. Your rights. Your workspace.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              Manage your own submissions from first details and secure assets through review,
              rights clearance and authorized delivery.
            </p>
          </div>
          <Link
            to="/account"
            className="inline-flex min-h-10 items-center rounded-full border border-line-strong px-4 py-2 text-sm font-semibold transition hover:border-accent"
          >
            Account & access <span aria-hidden="true" className="ml-2">↗</span>
          </Link>
        </div>
        <div className="relative mt-7 grid gap-2 sm:grid-cols-4">
          {[
            ["01", "Submit", "Create your title record"],
            ["02", "Prepare", "Add metadata and assets"],
            ["03", "Review", "Track QC and rights feedback"],
            ["04", "Deliver", "Follow authorized delivery"],
          ].map(([number, label, description]) => (
            <div key={number} className="rounded-xl border border-line bg-bg/70 p-3">
              <p className="text-[11px] font-semibold tracking-widest text-accent">{number}</p>
              <p className="mt-1 text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-muted">{description}</p>
            </div>
          ))}
        </div>
      </header>

      <nav
        aria-label="Creator workspace navigation"
        className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto border-y border-line bg-bg/95 px-1 py-2 backdrop-blur"
      >
        {SECTIONS.map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 rounded-full px-3 py-2 text-xs font-medium text-muted transition hover:bg-surface hover:text-fg sm:text-sm"
          >
            {label}
          </a>
        ))}
      </nav>

      <section className="space-y-4" aria-label="Creator title overview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Overview</h2>
          <span className="text-xs text-muted">Authenticated account scope · up to 200 returned records</span>
        </div>
        {titlesQ.isPending ? (
          <p className="text-sm text-muted">Loading your title records…</p>
        ) : null}
        {titlesQ.isError ? (
          <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm">
            <p>Title records could not be loaded. Dashboard totals are hidden until the data source responds.</p>
            <button
              type="button"
              onClick={() => void titlesQ.refetch()}
              className="mt-3 font-semibold text-accent underline"
            >
              Retry
            </button>
          </div>
        ) : !titlesQ.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="My titles" value={titles.length} note="Records returned for your Creator account" />
            <Metric label="In progress" value={inProgress.length} note="Upload, preparation, QC or rights review" />
            <Metric label="Licensing ready" value={licensingReady.length} note="Titles in the licensing-ready stage" />
            <Metric label="Live / licensed" value={live.length} note="Buyer-facing or licensed lifecycle records" />
          </div>
        ) : null}
      </section>

      <section id="my-titles" className="scroll-mt-20 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Your catalogue</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">My Titles</h2>
            <p className="mt-1 text-sm text-muted">
              Only records returned by the authenticated, server-scoped Creator title query are shown.
            </p>
          </div>
          <a href="#add-title" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90">
            + Add a title
          </a>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <TitleList actor={actor} empty="No titles are available for this account yet. Start a submission to add your first title." />
        </div>
      </section>

      <section id="add-title" className="scroll-mt-20 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Start here</p>
          <h2 className="font-display text-2xl font-semibold">Add New Title</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Submit a finished film through the existing Bridge form. Submission creates a record; it does
            not itself approve QC, ownership, licensing or publication.
          </p>
          <NewSubmissionPanel />
        </div>
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Separate submission path</p>
          <h3 className="font-display text-xl font-semibold">Story & Concept</h3>
          <p className="text-sm leading-relaxed text-muted">
            Keep story concepts separate from finished-film title records. A concept submission is not a
            finished film or a license-ready asset.
          </p>
          <MyStoryConcepts actor={actor} />
        </div>
      </section>

      <section id="metadata" className="scroll-mt-20 grid gap-4 md:grid-cols-2">
        <InfoPanel
          eyebrow="Title workspace"
          title="Metadata & Credits"
          description="Open one of your title records to review and update the metadata and credits fields currently enabled for your account."
          action="Open My Titles"
          href="#my-titles"
        />
        <InfoPanel
          id="rights"
          eyebrow="Ownership evidence"
          title="Rights & Ownership"
          description="Provide ownership and authorization information where requested. Attestations do not replace signed chain-of-title documents or Legal verification."
          action="Review title records"
          href="#my-titles"
        />
      </section>

      <section id="assets" className="scroll-mt-20">
        <MediaWorkspaceDesk actor={actor} mode="storage" />
      </section>

      <section id="post-production" className="scroll-mt-20">
        <MediaWorkspaceDesk actor={actor} mode="post-production" />
      </section>

      <section id="review" className="scroll-mt-20 grid gap-4 md:grid-cols-2">
        <InfoPanel
          eyebrow="QC & feedback"
          title="Review & Corrections"
          description="Track the title's current review stage and open its record for available feedback. Creator accounts cannot approve QC or Legal decisions."
          action="View title status"
          href="#my-titles"
        />
        <InfoPanel
          id="delivery"
          eyebrow="Release control"
          title="Delivery Status"
          description="Delivery is visible only after the required Bridge authorization. Submission or upload alone does not publish a title to Loop or buyers."
          action="View authorized title records"
          href="#my-titles"
        />
      </section>

      <section id="updates" className="scroll-mt-20 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Activity</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Recent Title Updates</h2>
        </div>
        {titlesQ.isPending ? (
          <p className="text-sm text-muted">Loading recent title updates…</p>
        ) : titlesQ.isError ? (
          <p className="rounded-xl border border-line p-4 text-sm text-muted">Updates unavailable while title records cannot be loaded.</p>
        ) : recent.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">
                    {title.name}
                  </Link>
                  <p className="text-xs text-muted">Updated {formatDate(title.updatedAt)}</p>
                </div>
                <StatusChip status={title.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No title updates yet.</p>
        )}
      </section>

      <section id="statements" className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Creator finance</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Statements</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          Creator earnings, commissions, adjustments and downloadable statements are shown only when
          verified creator-payable ledger and reconciliation data are available. Title licensing values
          are not treated as creator earnings.
        </p>
        <p className="mt-4 inline-flex rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted">
          NOT VERIFIED · No statement feed connected
        </p>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted">
        <p>Creator access is limited to your own authorized records. QC, Legal and publishing approvals remain separate.</p>
        <Link to="/account" className="font-semibold hover:text-fg">Manage account →</Link>
      </footer>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
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
    <article id={id} className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">{eyebrow}</p>
      <h2 className="mt-2 font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      <a href={href} className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline">
        {action} →
      </a>
    </article>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date unavailable"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
