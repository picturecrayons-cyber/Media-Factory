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

const IN_PROGRESS = new Set(["DRAFT", "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"]);
const COMPLETED = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator Home">
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
  const completed = titles.filter((title) => COMPLETED.has(title.status));
  const recent = [...titles].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Creator workspace</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Your submissions</h2>
          <p className="mt-1 text-sm text-muted">Create a film or story and follow its review progress.</p>
        </div>
        <Link to="/account" className="text-sm font-semibold text-accent hover:underline">Account</Link>
      </header>

      {titlesQ.isError ? (
        <div role="alert" className="rounded-lg border border-line p-3 text-sm">
          <p>Your account-scoped submission summary is unavailable.</p>
          <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
        </div>
      ) : titlesQ.isPending ? (
        <p className="text-sm text-muted">Loading your submissions…</p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-line py-3 text-sm">
          <span><strong className="tabular-nums">{titles.length}</strong> submissions</span>
          <span><strong className="tabular-nums">{inProgress.length}</strong> in progress</span>
          <span><strong className="tabular-nums">{completed.length}</strong> licensed / delivered</span>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">Start a submission</h3>
          <p className="text-sm text-muted">Choose Finished Film or Story / Concept.</p>
        </div>
        <NewSubmissionPanel />
      </section>

      <section id="submissions" className="space-y-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">My titles</h3>
            <p className="text-sm text-muted">Only your own authorized records are shown.</p>
          </div>
        </div>
        <TitleList empty="No finished-film submissions yet." />
        <MyStoryConcepts />
      </section>

      <section id="updates" className="border-t border-line pt-4">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold">
            <span>Recent activity</span><span className="text-xs font-normal text-muted">Latest 3 updates</span>
          </summary>
          {titlesQ.isPending || titlesQ.isError ? null : recent.length ? (
            <ul className="mt-2 divide-y divide-line">
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
          ) : <p className="mt-2 text-sm text-muted">No recent updates.</p>}
          <Link to="/deliveries" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">Updates & deliveries</Link>
        </details>
      </section>

      <section id="documents" className="border-t border-line pt-4">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Private document vault</summary>
          <p className="mt-1 text-xs text-muted">Upload and link private rights documents.</p>
          <div className="mt-4"><CreatorDocumentVault /></div>
        </details>
      </section>
      <footer className="border-t border-line pt-4 text-xs text-muted">
        QC, Legal approval, licensing and publication are separate authorized decisions.
      </footer>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date unavailable"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
