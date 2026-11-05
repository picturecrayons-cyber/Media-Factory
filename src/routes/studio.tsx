import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Clapperboard, Film, Lightbulb, ShieldCheck } from "lucide-react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio">
          <div className="mx-auto max-w-6xl space-y-9 pb-16">
            <section className="relative isolate overflow-hidden rounded-3xl bg-[#101d2b] px-6 py-8 text-white shadow-xl shadow-slate-900/10 sm:px-9 sm:py-10">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-28 -z-10 h-80 w-80 rounded-full border border-white/10" />
              <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-14 -z-10 h-56 w-56 rounded-full border border-[#d7b878]/25" />
              <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7b878]"><span className="h-1.5 w-1.5 rounded-full bg-[#d7b878]" />Studio workspace</p>
                  <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your stories deserve a bigger stage.</h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">Manage finished films, track submission progress and keep original story concepts in their own review space.</p>
                  <p className="mt-5 text-xs font-medium tracking-wide text-slate-400">{actor.organizationName || actor.displayName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-200 backdrop-blur"><ShieldCheck className="h-5 w-5 text-[#d7b878]" aria-hidden="true" />Secure rights-holder workspace</div>
              </div>
              <div className="mt-8 grid gap-3 border-t border-white/10 pt-5 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2.5"><Film className="h-5 w-5 text-[#d7b878]" /></span><span><strong className="block text-white">Finished films</strong><span className="text-xs text-slate-400">Title records and assets</span></span></div>
                <div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2.5"><Lightbulb className="h-5 w-5 text-[#d7b878]" /></span><span><strong className="block text-white">Story concepts</strong><span className="text-xs text-slate-400">A separate review workflow</span></span></div>
                <div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2.5"><Clapperboard className="h-5 w-5 text-[#d7b878]" /></span><span><strong className="block text-white">Production services</strong><span className="text-xs text-slate-400">Coordinated by the admin desk</span></span></div>
              </div>
            </section>
            <section aria-labelledby="studio-submission-heading" className="grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Start here</p><h2 id="studio-submission-heading" className="mt-1 text-xl font-semibold tracking-tight">Bring a film to Bridge</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Create a title first. Add artwork and supporting assets from the title workspace; upload the film master there when ready.</p></div>
              <div className="sm:min-w-[260px]"><NewSubmissionPanel /></div>
            </section>
            <section aria-labelledby="finished-films-heading" className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Your catalogue</p><h2 id="finished-films-heading" className="mt-1 text-2xl font-semibold tracking-tight">Finished films</h2><p className="mt-1 text-sm text-muted">Every film submission, from draft through delivery.</p></div><span className="inline-flex items-center gap-1 text-xs font-medium text-muted">Open a title to manage it <ArrowUpRight className="h-3.5 w-3.5" /></span></div>
              <div className="studio-title-list"><TitleList empty="No finished films yet. Start with a new submission." /></div>
            </section>
            <div className="studio-story-list"><MyStoryConcepts /></div>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
