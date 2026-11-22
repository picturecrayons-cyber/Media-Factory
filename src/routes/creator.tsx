import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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

type CreatorSection = "overview" | "titles" | "submissions" | "documents";

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => <BridgeShell actor={actor} title="Creator workspace"><CreatorDashboard actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function CreatorDashboard({ actor }: { actor: { userId: string; organizationId?: string | null; displayName?: string } }) {
  const [section, setSection] = useState<CreatorSection>("overview");
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", actor.userId, actor.organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];
  const inProgress = titles.filter((title) => ["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(title.status)).length;
  const live = titles.filter((title) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status)).length;
  const tabs: { id: CreatorSection; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "titles", label: "My Titles" },
    { id: "submissions", label: "Submissions" },
    { id: "documents", label: "Documents" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Creator workspace</p>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Your title library</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Manage your film records, submit new work and follow verified review and delivery updates.</p>
        </div>
        <Link to="/account" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent">Account ↗</Link>
      </header>

      <nav aria-label="Creator workspace sections" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setSection(tab.id)} aria-current={section === tab.id ? "page" : undefined}
            className={section === tab.id ? "rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg" : "rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-fg"}>
            {tab.label}
          </button>
        ))}
      </nav>

      {section === "overview" ? (
        <section className="space-y-5">
          {titlesQ.isPending ? <p className="text-sm text-muted">Loading your title records…</p> : null}
          {titlesQ.isError ? (
            <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm">
              <p>Title records could not be loaded. Overview counts are hidden until the data source responds.</p>
              <button type="button" onClick={() => void titlesQ.refetch()} className="mt-3 font-semibold text-accent underline">Retry</button>
            </div>
          ) : !titlesQ.isPending ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="My titles" value={titles.length} />
              <Metric label="In progress" value={inProgress} />
              <Metric label="Live / licensed" value={live} />
            </div>
          ) : null}
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div><h3 className="font-display text-xl font-semibold">Recent title updates</h3><p className="text-sm text-muted">Latest changes to your own canonical title records.</p></div>
              <button type="button" onClick={() => setSection("titles")} className="text-sm font-semibold text-accent hover:underline">All titles ↗</button>
            </div>
            {titlesQ.isPending ? <p className="text-sm text-muted">Loading updates…</p> : titlesQ.isError ? <p className="rounded-xl border border-line p-4 text-sm text-muted">Updates unavailable.</p> : [...titles].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,5).length ? (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {[...titles].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,5).map((title)=>(
                  <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div><Link to="/title/$id" params={{id:title.id}} className="font-medium hover:text-accent">{title.name}</Link><p className="text-xs text-muted">Updated {formatDate(title.updatedAt)}</p></div>
                    <StatusChip status={title.status}/>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No title updates yet.</p>}
          </section>
          <p className="text-xs text-muted">QC, Rights, Legal, Licensing and Loop publishing remain separate verified decisions.</p>
        </section>
      ) : null}

      {section === "titles" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="font-display text-xl font-semibold">Title Library</h3><p className="mt-1 text-sm text-muted">Search, filter and open the canonical Bridge record for each title.</p></div>
          </div>
          <TitleList empty="No titles are available for your Creator account yet." />
        </section>
      ) : null}

      {section === "submissions" ? (
        <section className="space-y-5">
          <div><h3 className="font-display text-xl font-semibold">Create a submission</h3><p className="mt-1 text-sm text-muted">Finished-film records and Story / Concept submissions stay on separate review paths.</p></div>
          <NewSubmissionPanel />
          <MyStoryConcepts />
        </section>
      ) : null}

      {section === "documents" ? (
        <section className="space-y-3">
          <div><h3 className="font-display text-xl font-semibold">Document Vault</h3><p className="mt-1 text-sm text-muted">Upload and verify private rights and ownership documents, then link them to your titles.</p></div>
          <CreatorDocumentVault />
        </section>
      ) : null}
      <footer className="border-t border-line pt-4 text-xs text-muted">Creator records are restricted to your authenticated account. <Link to="/account" className="font-semibold hover:text-fg">Manage account and security ↗</Link></footer>
    </div>
  );
}

function Metric({label,value}:{label:string;value:number}) {
  return <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p></article>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "date unavailable" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
