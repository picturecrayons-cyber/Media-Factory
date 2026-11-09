import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Clapperboard, Film, Lightbulb, ShieldCheck, Workflow } from "lucide-react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listTitles } from "@/lib/bridge/titles";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => <StudioWorkspace actor={actor} />}
    </RequireBridge>
  );
}

function StudioWorkspace({ actor }: { actor: BridgeActor }) {
  const titlesQuery = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const conceptsQuery = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
  });
  const allTitles = titlesQuery.data?.titles ?? [];
  const films = allTitles.filter((title) => title.contentType.trim().toLowerCase() === "film");
  const concepts = conceptsQuery.data?.concepts ?? [];
  const uploads = films.filter((title) => title.status.toUpperCase() === "UPLOADING").length;
  const preparing = films.filter((title) => title.status.toUpperCase() === "PREPARING").length;

  return (
    <BridgeShell actor={actor} title="Studio">
      <div className="mx-auto max-w-7xl space-y-8 pb-16">
        <section className="relative isolate overflow-hidden rounded-3xl bg-[#101d2b] px-6 py-8 text-white shadow-xl shadow-slate-900/10 sm:px-9 sm:py-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-28 -z-10 h-80 w-80 rounded-full border border-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-14 -z-10 h-56 w-56 rounded-full border border-[#d7b878]/25" />
          <div className="relative max-w-3xl">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7b878]"><span className="h-1.5 w-1.5 rounded-full bg-[#d7b878]" />Crayons Bridge · Studio</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your Studio</h2>
            <p className="mt-2 text-lg text-slate-200">Your films. Your stories. One professional workspace.</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Manage finished-film submissions and story development separately. Open a film to manage its title details, artwork, assets and master upload.</p>
            <p className="mt-5 text-xs font-medium tracking-wide text-slate-400">{actor.organizationName || actor.displayName || "Studio account"}</p>
          </div>
          <div className="relative mt-8 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"><span className="rounded-lg bg-white/10 p-2.5"><Film className="h-5 w-5 text-[#d7b878]" /></span><span><strong className="block text-2xl tabular-nums">{titlesQuery.isPending ? "—" : titlesQuery.isError ? "!" : String(films.length).padStart(2,"0")}</strong><span className="text-xs text-slate-400">Film submissions</span></span></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"><span className="rounded-lg bg-white/10 p-2.5"><Lightbulb className="h-5 w-5 text-[#d7b878]" /></span><span><strong className="block text-2xl tabular-nums">{!STORY_CONCEPT_ENABLED ? "—" : conceptsQuery.isPending ? "—" : conceptsQuery.isError ? "!" : String(concepts.length).padStart(2,"0")}</strong><span className="text-xs text-slate-400">Story concepts</span></span></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"><span className="rounded-lg bg-white/10 p-2.5"><Clapperboard className="h-5 w-5 text-[#d7b878]" /></span><span><strong className="block text-2xl tabular-nums">{titlesQuery.isPending ? "—" : titlesQuery.isError ? "!" : String(uploads).padStart(2,"0")}</strong><span className="text-xs text-slate-400">Uploading now</span></span></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"><span className="rounded-lg bg-white/10 p-2.5"><Workflow className="h-5 w-5 text-[#d7b878]" /></span><span><strong className="block text-2xl tabular-nums">{titlesQuery.isPending ? "—" : titlesQuery.isError ? "!" : String(preparing).padStart(2,"0")}</strong><span className="text-xs text-slate-400">Preparing</span></span></div>
          </div>
        </section>

        <section aria-labelledby="studio-new-heading" className="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1.15fr)] xl:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Start something new</p>
            <h2 id="studio-new-heading" className="mt-1 text-xl font-semibold tracking-tight">New submission</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Choose the right path for a completed film or an original story idea. Each follows its own review process.</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-accent" />Existing Studio access and submission permissions apply.</div>
          </div>
          <NewSubmissionPanel />
        </section>

        <section aria-labelledby="finished-films-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Your catalogue</p><h2 id="finished-films-heading" className="mt-1 text-2xl font-semibold tracking-tight">Finished films</h2><p className="mt-1 text-sm text-muted">Film records only · status reflects the existing submission workflow.</p></div>
            <span className="text-xs text-muted">Select a card to manage its title <ArrowUpRight className="inline h-3.5 w-3.5" /></span>
          </div>
          {titlesQuery.isError ? <div role="alert" className="rounded-2xl border border-line bg-surface p-5 text-sm text-accent">Film catalogue unavailable. Retry the page to load your records.</div> : <TitleList contentType="Film" empty="No finished films yet. Start a finished-film submission above." />}
        </section>

        {STORY_CONCEPT_ENABLED ? (
          <section aria-labelledby="story-concepts-heading" className="space-y-4 border-t border-line pt-7">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Ideas in development</p><h2 id="story-concepts-heading" className="mt-1 text-2xl font-semibold tracking-tight">Story concepts</h2><p className="mt-1 text-sm text-muted">A separate admin-curation workflow. Concepts never appear in Finished films.</p></div>
            <MyStoryConcepts />
          </section>
        ) : null}
      </div>
    </BridgeShell>
  );
}
