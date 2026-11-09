import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/studio")({ component: Studio });
const TABS = ["Finished", "Story", "Storage"] as const;
type Tab = (typeof TABS)[number];

function Studio() {
  return <RequireBridge allow="studio">{(actor) => <BridgeShell actor={actor} title="Studio workspace"><StudioDesk /></BridgeShell>}</RequireBridge>;
}

function StudioDesk() {
  const [tab, setTab] = useState<Tab>("Finished");
  const conceptsQ = useQuery({ queryKey: ["my-story-concepts"], queryFn: () => listMyStoryConcepts(), enabled: STORY_CONCEPT_ENABLED, retry: false });
  const conceptIds = conceptsQ.data?.concepts.map((concept) => concept.title_id) ?? [];
  const classificationReady = !STORY_CONCEPT_ENABLED || conceptsQ.isSuccess;
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p><h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Production desk</h2><p className="mt-2 text-sm text-muted">Manage your studio-scoped films, story concepts and storage. Every member remains limited to authorized organization records.</p></div>
          <NewSubmissionPanel />
        </div>
      </section>
      <nav aria-label="Studio dashboard tabs" role="tablist" className="flex gap-2 overflow-x-auto border-b border-line pb-2">
        {TABS.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`shrink-0 rounded-lg border px-5 py-3 text-sm font-semibold ${tab === item ? "border-accent bg-accent/10 text-fg" : "border-line text-muted hover:text-fg"}`}>{item}</button>)}
      </nav>
      <div role="tabpanel" aria-label={tab} className="min-h-72 space-y-4">
        {tab === "Finished" ? <section className="space-y-3"><h3 className="font-display text-xl font-semibold">Finished films</h3>{classificationReady ? <TitleList empty="No finished-film submissions yet." excludeIds={conceptIds} /> : <p role="alert" className="text-sm text-muted">Submission classification is not verified. The list is paused.</p>}</section> : null}
        {tab === "Story" ? <section className="space-y-3"><h3 className="font-display text-xl font-semibold">Story & Concepts</h3><p className="text-sm text-muted">Separate curation workflow; concept records are not treated as finished films.</p>{STORY_CONCEPT_ENABLED ? <MyStoryConcepts /> : <p className="text-sm text-muted">Concept submissions are not enabled in this environment.</p>}</section> : null}
        {tab === "Storage" ? <section className="space-y-4"><h3 className="font-display text-xl font-semibold">Studio cloud storage</h3><div className="grid gap-3 sm:grid-cols-3">{["Storage used","Available capacity","Active uploads"].map((label) => <article key={label} className="rounded-xl border border-line p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 font-display text-2xl font-semibold">—</p></article>)}</div><p className="rounded-xl border border-line p-4 text-sm text-muted">Organization-scoped storage usage is not yet connected. No estimated values or paid upgrades are shown.</p></section> : null}
      </div>
      <section className="space-y-3 rounded-xl border border-line p-5">
        <div><h3 className="font-semibold">DIT Desk · Agent-assisted handoff</h3><p className="mt-1 text-sm text-muted">A future DIT assistant can organize intake checklists, file manifests, checksum evidence and handoff status for authorized DIT operators.</p></div>
        <div className="grid gap-2 sm:grid-cols-2"><p className="rounded-lg bg-surface p-3 text-sm">Intake checklist · Planned</p><p className="rounded-lg bg-surface p-3 text-sm">Manifest & checksum review · Planned</p><p className="rounded-lg bg-surface p-3 text-sm">DIT handoff tracking · Planned</p><p className="rounded-lg bg-surface p-3 text-sm">Human sign-off · Required</p></div>
        <p className="text-xs text-muted">No autonomous QC approval, legal clearance, rights decision, publication or delivery authority. Studio membership does not grant DIT sign-off.</p>
      </section>
    </div>
  );
}
