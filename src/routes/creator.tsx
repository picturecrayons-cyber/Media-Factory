import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/creator")({ component: Creator });
const TABS = ["Finished", "Story", "Storage"] as const;
type Tab = (typeof TABS)[number];

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => <BridgeShell actor={actor} title="Creator workspace"><CreatorDesk /></BridgeShell>}
    </RequireBridge>
  );
}

function CreatorDesk() {
  const [tab, setTab] = useState<Tab>("Finished");
  const conceptsQ = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
    retry: false,
  });
  const conceptIds = conceptsQ.data?.concepts.map((concept) => concept.title_id) ?? [];
  const classificationReady = !STORY_CONCEPT_ENABLED || conceptsQ.isSuccess;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Private Creator Workspace</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your films. Your stories. Your files.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">One simple place for finished-film submissions, story concepts and cloud storage. Bridge teams retain QC, Legal, rights, licensing and delivery approval authority.</p>
          </div>
          <NewSubmissionPanel />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Creator workspace summary">
        <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">Finished films</p><p className="mt-2 text-sm font-medium">Your film submissions</p></article>
        <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">Story & concepts</p><p className="mt-2 text-sm font-medium">Separate curation workflow</p></article>
        <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">Storage</p><p className="mt-2 text-sm font-medium">Private cloud files</p></article>
      </section>

      <nav aria-label="Creator dashboard tabs" role="tablist" className="flex gap-2 overflow-x-auto border-b border-line pb-2">
        {TABS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}
            className={`shrink-0 rounded-lg border px-5 py-3 text-sm font-semibold transition ${tab === item ? "border-accent bg-accent/10 text-fg" : "border-line text-muted hover:text-fg"}`}>
            {item}
          </button>
        ))}
        <Link to="/account" className="ml-auto shrink-0 self-center px-3 py-2 text-sm text-muted hover:text-fg">General account ↗</Link>
      </nav>

      <div role="tabpanel" aria-label={tab} className="min-h-72 space-y-4">
        {tab === "Finished" ? (
          <section className="space-y-3">
            <div><h3 className="font-display text-xl font-semibold">Finished-film submissions</h3><p className="mt-1 text-sm text-muted">Upload and manage completed films. Review status and permitted feedback appear on each title.</p></div>
            {!classificationReady ? <p role="alert" className="rounded-xl border border-line p-4 text-sm text-muted">Story classification could not be verified. Finished-film records are paused to prevent misclassification.</p> :
              <TitleList empty="No finished-film submissions yet. Start with New submission." excludeIds={conceptIds} />}
            <p className="rounded-xl border border-line p-4 text-xs text-muted">QC approval, legal clearance, rights verification, licensing and publication remain restricted to authorized Bridge teams.</p>
          </section>
        ) : null}
        {tab === "Story" ? (
          <section className="space-y-3">
            <div><h3 className="font-display text-xl font-semibold">Story & Concept submissions</h3><p className="mt-1 text-sm text-muted">Ideas and concepts follow a separate review path; they are not finished films and are never published to Loop automatically.</p></div>
            {!STORY_CONCEPT_ENABLED ? <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">Story / Concept submissions are not enabled in this environment.</p> :
              conceptsQ.isError ? <p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">Concept records could not be verified. No sample records are shown.</p> : <MyStoryConcepts />}
          </section>
        ) : null}
        {tab === "Storage" ? (
          <section className="space-y-4">
            <div><h3 className="font-display text-xl font-semibold">Cloud storage</h3><p className="mt-1 text-sm text-muted">Private storage for your authorized film masters and supporting assets.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StorageMetric label="Storage used" value="—" />
              <StorageMetric label="Available capacity" value="—" />
              <StorageMetric label="Active uploads" value="—" />
            </div>
            <div className="rounded-xl border border-line bg-surface p-5">
              <h4 className="font-semibold">Storage & backup status</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted">Live per-account storage totals and capacity are not yet connected to this dashboard. No usage or backup figures are estimated. Existing cloud storage remains the current upload destination; physical backup is handled separately.</p>
              <p className="mt-3 text-xs text-muted">Storage upgrades are request-only. No paid upgrade, purchase or payment is initiated here.</p>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function StorageMetric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 font-display text-2xl font-semibold">{value}</p></article>;
}
