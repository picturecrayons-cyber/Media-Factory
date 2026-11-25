import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { WorkspaceAction, WorkspaceOs, WorkspacePanel } from "@/components/bridge/workspace-os";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/creator")({ component: Creator });

const LIVE = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);
const IN_PROGRESS = new Set(["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"]);
const NAV = [
  { label: "Overview", href: "#overview" },
  { label: "My Work", href: "#my-work" },
  { label: "New Submission", href: "#new-submission" },
  { label: "Documents", href: "#documents" },
  { label: "Updates", href: "#updates" },
] as const;

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator OS">
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
  const recent = [...titles].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);

  return (
    <WorkspaceOs
      eyebrow="Crayons Bridge · Creator OS"
      title="Your work, in one place."
      description="Prepare your titles, manage submissions and follow authorized review and delivery from one focused workspace."
      items={[...NAV]}
      actions={
        <>
          <WorkspaceAction href="#new-submission">New Title</WorkspaceAction>
          <WorkspaceAction href="#my-work" secondary>Upload / Continue</WorkspaceAction>
          <Link to="/deliveries" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Open Delivery</Link>
        </>
      }
    >
      <WorkspacePanel id="overview" eyebrow="At a glance" title="My workspace" description="Live totals are calculated only from the authenticated title query. If that source fails, values remain unavailable.">
        {titlesQ.isPending ? <p className="text-sm text-muted">Loading your title records…</p> : null}
        {titlesQ.isError ? (
          <div role="alert" className="rounded-lg border border-line p-4 text-sm">
            <p>Title records could not be loaded. No dashboard totals are shown.</p>
            <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
          </div>
        ) : !titlesQ.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="My titles" value={titles.length} />
            <Metric label="In progress" value={inProgress.length} />
            <Metric label="Licensing ready" value={licensingReady.length} />
            <Metric label="Live / licensed" value={live.length} />
          </div>
        ) : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {[
            ["01", "Submit", "Open a title record"],
            ["02", "Prepare", "Add metadata and assets"],
            ["03", "Review", "Track QC and rights"],
            ["04", "Deliver", "Follow approved delivery"],
          ].map(([n, label, detail]) => (
            <div key={n} className="rounded-lg border border-line bg-elevated p-3">
              <p className="text-[10px] font-bold tracking-widest text-accent">{n}</p>
              <p className="mt-1 text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel id="my-work" eyebrow="Account-scoped catalogue" title="My Work" description="Only title records returned by the authenticated server query are displayed. Story / Concept records remain a separate submission path.">
        <TitleList empty="No titles are available for this account yet. Start a submission to add your first title." />
        <div className="mt-4">
          <MyStoryConcepts />
        </div>
      </WorkspacePanel>

      <WorkspacePanel id="new-submission" eyebrow="Start here" title="New Submission" description="Create a draft title or submit a story concept through the existing Bridge workflows. Submission does not approve QC, ownership, licensing or publication.">
        <NewSubmissionPanel />
      </WorkspacePanel>

      <WorkspacePanel id="documents" eyebrow="Secure records" title="Documents & Assets" description="Open an authorized title to manage its available metadata, rights evidence, documents and secure media assets. This dashboard does not fabricate file lists, upload percentages or verification states.">
        <div className="flex flex-wrap gap-2">
          <Link to="/workspace" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Open title workspace</Link>
          <Link to="/submit-film" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Detailed submission</Link>
        </div>
        <p className="mt-3 text-xs text-muted">Document vault availability is not independently certified while the Preview database binding remains unresolved.</p>
      </WorkspacePanel>

      <WorkspacePanel id="updates" eyebrow="Activity" title="Recent Updates" description="Most recently updated title records returned by the same authenticated query.">
        {titlesQ.isPending ? <p className="text-sm text-muted">Loading recent updates…</p> : null}
        {titlesQ.isError ? <p className="text-sm text-muted">Updates unavailable while title records cannot be loaded.</p> : null}
        {!titlesQ.isPending && !titlesQ.isError && recent.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {recent.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link>
                  <p className="text-xs text-muted">Updated {formatDate(title.updatedAt)}</p>
                </div>
                <StatusChip status={title.status} />
              </li>
            ))}
          </ul>
        ) : null}
        {!titlesQ.isPending && !titlesQ.isError && !recent.length ? <p className="text-sm text-muted">No title updates yet.</p> : null}
      </WorkspacePanel>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <p>Creator access remains limited to authorized records. QC, Legal and publishing approvals stay separate.</p>
        <Link to="/account" className="font-semibold hover:text-accent">Account & access →</Link>
      </footer>
    </WorkspaceOs>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted">From verified query response</p>
    </article>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date unavailable"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
