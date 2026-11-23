import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";
import { listTitles } from "@/lib/bridge/titles";
import type { TitleStatus } from "@/lib/bridge/types";

export const Route = createFileRoute("/creator")({ component: Creator });

type Tab = "overview" | "titles" | "submit" | "documents" | "activity";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "titles", label: "My work" },
  { id: "submit", label: "New submission" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Updates" },
];
const ACTIVE = new Set(["DRAFT", "SUBMITTED", "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "IN_NEGOTIATION"]);
const LIVE = new Set(["LIVE_FOR_BUYERS", "LICENSED", "DELIVERED"]);

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

function CreatorDashboard({ actor }: { actor: { userId: string; organizationId?: string | null; displayName?: string } }) {
  const [tab, setTab] = useState<Tab>("overview");
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", actor.userId, actor.organizationId ?? null],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const all = titlesQ.data?.titles ?? [];
  // Never silently classify a legacy/null discriminator as a finished film.
  const films = all.filter((title) => title.submissionType === "finished_film");
  const concepts = all.filter((title) => title.submissionType === "story_concept");
  const unclassified = all.filter((title) => !title.submissionType);
  const inProgress = films.filter((title) => ACTIVE.has(title.status));
  const ready = films.filter((title) => title.status === "LICENSING_READY");
  const live = films.filter((title) => LIVE.has(title.status));
  const recent = [...all].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 8);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-1 pb-12">
      <header className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Crayons Bridge · Creator</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Your Creator dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              One place to manage submissions, title preparation, rights evidence, review updates and authorized delivery.
            </p>
          </div>
          <Link to="/account" className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:border-accent">
            Account & access
          </Link>
        </div>
        <nav aria-label="Creator dashboard" className="mt-6 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === item.id ? "bg-accent text-bg" : "border border-line text-muted hover:text-fg"}`}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {titlesQ.isPending ? <p className="rounded-xl border border-line p-4 text-sm text-muted">Loading your account records…</p> : null}
      {titlesQ.isError ? (
        <div role="alert" className="rounded-xl border border-line p-4 text-sm">
          <p>Your titles could not be loaded. No empty-state totals are shown while the service is unavailable.</p>
          <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
        </div>
      ) : null}

      {tab === "overview" && !titlesQ.isPending && !titlesQ.isError ? (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Finished films" value={films.length} />
            <Metric label="In progress" value={inProgress.length} />
            <Metric label="Licensing ready" value={ready.length} />
            <Metric label="Live / licensed" value={live.length} />
          </div>
          {unclassified.length ? (
            <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
              {unclassified.length} record(s) have no submission type and are kept separate until their classification is verified.
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">My latest work</h2>
                <button type="button" onClick={() => setTab("titles")} className="text-sm font-semibold text-accent">View all</button>
              </div>
              <TitleRows titles={[...films, ...concepts].sort((a,b) => Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,5)} empty="No submissions have been returned for this account." />
            </section>
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-display text-xl font-semibold">Next steps</h2>
              <ul className="mt-3 space-y-3 text-sm text-muted">
                <li><strong className="text-fg">Submit:</strong> create a finished-film or Story / Concept record.</li>
                <li><strong className="text-fg">Prepare:</strong> complete title metadata and add secure assets.</li>
                <li><strong className="text-fg">Evidence:</strong> upload signed PDFs and link verified documents.</li>
                <li><strong className="text-fg">Review:</strong> follow QC and Legal feedback; approvals remain with authorized teams.</li>
              </ul>
              <button type="button" onClick={() => setTab("submit")} className="mt-5 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-bg">Start a submission</button>
            </section>
          </div>
        </section>
      ) : null}

      {tab === "titles" ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-display text-2xl font-bold">My work</h2><p className="mt-1 text-sm text-muted">Finished films and Story / Concept submissions remain distinct.</p></div>
            <button type="button" onClick={() => setTab("submit")} className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-bg">+ New submission</button>
          </div>
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-semibold">Finished films · {films.length}</h3>
            <TitleRows titles={films} empty="No finished-film titles are available for this account." />
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-semibold">Story / Concepts · {concepts.length}</h3>
            <MyStoryConcepts actor={actor} />
            {!concepts.length ? <p className="mt-2 text-sm text-muted">No Story / Concept title records returned by the title query.</p> : null}
          </section>
          {unclassified.length ? <section className="rounded-2xl border border-line bg-surface p-5"><h3 className="font-semibold">Classification needs verification · {unclassified.length}</h3><TitleRows titles={unclassified} empty="" /></section> : null}
        </section>
      ) : null}

      {tab === "submit" ? (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
          <h2 className="font-display text-2xl font-bold">Create a submission</h2>
          <p className="mt-2 text-sm text-muted">Choose the correct path. A submission does not approve QC, rights, licensing or publication.</p>
          <div className="mt-5"><NewSubmissionPanel /></div>
        </section>
      ) : null}

      {tab === "documents" ? <CreatorDocumentVault actor={actor} /> : null}

      {tab === "activity" ? (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-2xl font-bold">Recent updates</h2>
          {titlesQ.isPending ? <p className="mt-3 text-sm text-muted">Loading updates…</p> : titlesQ.isError ? <p className="mt-3 text-sm text-muted">Updates unavailable while title records cannot be loaded.</p> : <TitleRows titles={recent} empty="No title updates yet." showDate />}
        </section>
      ) : null}

      <footer className="border-t border-line pt-4 text-xs text-muted">
        Creator access is limited to authorized records. QC, Legal, publishing and payment approvals remain separate. Statements remain unavailable until verified creator-payable ledger and reconciliation data are connected.
      </footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="rounded-xl border border-line bg-surface p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p></article>;
}

function TitleRows({ titles, empty, showDate = false }: { titles: Array<{ id: string; name: string; language: string; year: number | null; contentType: string; status: TitleStatus; updatedAt: string }>; empty: string; showDate?: boolean }) {
  if (!titles.length) return <p className="mt-3 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-3 divide-y divide-line">
      {titles.map((title) => (
        <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
