import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { WorkspaceAction, WorkspaceOs, WorkspacePanel } from "@/components/bridge/workspace-os";
import { listTitles } from "@/lib/bridge/titles";
import type { BridgeTitle } from "@/lib/bridge/types";

export const Route = createFileRoute("/creator")({ component: Creator });

const LIVE = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);
const IN_PROGRESS = new Set(["DRAFT", "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"]);
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
    queryKey: ["bridge-titles", actor.userId, actor.organizationId ?? null],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const all = titlesQ.data?.titles ?? [];
  const films = all.filter((title) => title.submissionType === "finished_film");
  const concepts = all.filter((title) => title.submissionType === "story_concept");
  const unclassified = all.filter((title) => !title.submissionType);
  const inProgress = films.filter((title) => IN_PROGRESS.has(title.status));
  const licensingReady = films.filter((title) => title.status === "LICENSING_READY");
  const live = films.filter((title) => LIVE.has(title.status));
  const recent = [...all].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6);

  return (
    <WorkspaceOs
      eyebrow="Crayons Bridge · Creator OS"
      title="Your work, in one place."
      description="Prepare your titles, manage submissions and follow authorized review and delivery from one focused workspace."
      items={[...NAV]}
      actions={
        <>
          <WorkspaceAction href="#new-submission">New Title</WorkspaceAction>
          <WorkspaceAction href="#my-work" secondary>Continue Preparation</WorkspaceAction>
          <Link to="/deliveries" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Open Delivery</Link>
        </>
      }
    >
      <WorkspacePanel id="overview" eyebrow="At a glance" title="My workspace" description="Totals are calculated only from the authenticated title query. Records without a verified submission type are excluded from finished-film totals.">
        {titlesQ.isPending ? <p className="text-sm text-muted">Loading your title records…</p> : null}
        {titlesQ.isError ? (
          <div role="alert" className="rounded-lg border border-line p-4 text-sm">
            <p>Title records could not be loaded. No dashboard totals are shown.</p>
            <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
          </div>
        ) : !titlesQ.isPending ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Finished films" value={films.length} />
              <Metric label="In progress" value={inProgress.length} />
              <Metric label="Licensing ready" value={licensingReady.length} />
              <Metric label="Live / licensed" value={live.length} />
            </div>
            <p className="mt-3 text-xs text-muted">Story / Concept: {concepts.length} · Unclassified: {unclassified.length}</p>
          </>
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

      <WorkspacePanel id="my-work" eyebrow="Account-scoped catalogue" title="My Work" description="Finished films, Story / Concept submissions and records with an unknown discriminator are kept separate.">
        <div className="space-y-4">
          <TitleGroup title={`Finished films · ${films.length}`} titles={films} empty="No finished-film titles are available for this account." />
          <div className="border-t border-line pt-4"><MyStoryConcepts actor={actor} /></div>
          {unclassified.length ? (
            <div className="border-t border-line pt-4">
              <h4 className="font-semibold">Classification needs verification · {unclassified.length}</h4>
              <p className="mt-1 text-xs text-muted">These records are not silently treated as finished films.</p>
              <TitleRows titles={unclassified} />
            </div>
          ) : null}
        </div>
      </WorkspacePanel>

      <WorkspacePanel id="new-submission" eyebrow="Start here" title="New Submission" description="Create a draft title or submit a Story / Concept through the existing Bridge workflows. Submission does not approve QC, ownership, licensing or publication.">
        <NewSubmissionPanel />
      </WorkspacePanel>

      <WorkspacePanel id="documents" eyebrow="Secure records" title="Documents & Assets" description="Open an authorized title to manage the document, rights-evidence and secure-media workflows currently enabled for that record. The standalone Creator Document Vault is not included in this branch because its supporting schema and migration compatibility are not yet verified.">
        <div className="flex flex-wrap gap-2">
          <Link to="/workspace" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Open title workspace</Link>
          <Link to="/submit-film" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Detailed submission</Link>
        </div>
        <p className="mt-3 text-xs text-muted">Document vault availability remains NOT VERIFIED until Preview database binding and schema dependencies are reconciled.</p>
      </WorkspacePanel>

      <WorkspacePanel id="updates" eyebrow="Activity" title="Recent Updates" description="Latest title changes returned by the same authenticated query.">
        {titlesQ.isPending ? <p className="text-sm text-muted">Loading recent updates…</p> : null}
        {titlesQ.isError ? <p className="text-sm text-muted">Updates unavailable while title records cannot be loaded.</p> : null}
        {!titlesQ.isPending && !titlesQ.isError && recent.length ? <TitleRows titles={recent} showDate /> : null}
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
      <p className="mt-1 text-[11px] text-muted">From authenticated query response</p>
    </article>
  );
}

function TitleGroup({ title, titles, empty }: { title: string; titles: BridgeTitle[]; empty: string }) {
  return <section><h4 className="font-semibold">{title}</h4><TitleRows titles={titles} empty={empty} /></section>;
}

function TitleRows({ titles, empty, showDate = false }: { titles: BridgeTitle[]; empty?: string; showDate?: boolean }) {
  if (!titles.length) return <p className="mt-2 text-sm text-muted">{empty || "No records."}</p>;
  return (
    <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
      {titles.map((title) => (
        <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0">
            <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link>
            <p className="text-xs text-muted">{title.contentType} · {title.language}{title.year ? ` · ${title.year}` : ""}{showDate ? ` · Updated ${formatDate(title.updatedAt)}` : ""}</p>
          </div>
          <StatusChip status={title.status} />
        </li>
      ))}
    </ul>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "date unavailable" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
