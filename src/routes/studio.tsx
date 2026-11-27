import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio dashboard">
          <div className="mx-auto max-w-6xl space-y-7 px-1 pb-12">
            <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
                <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted">Manage finished films, story submissions, deliveries and media handover from one workspace.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/deliveries" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent">View deliveries</Link>
                <Link to="/submit-film" className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">New finished film</Link>
              </div>
            </section>

            <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Studio workspace">
              <a href="#studio-titles" className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
                <strong className="block">Finished films</strong>
                <span className="mt-1 block text-sm text-muted">View title status and continue submissions</span>
              </a>
              <a href="#studio-concepts" className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
                <strong className="block">Story concepts</strong>
                <span className="mt-1 block text-sm text-muted">Track concepts submitted for curation</span>
              </a>
              <Link to="/deliveries" className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
                <strong className="block">Deliveries</strong>
                <span className="mt-1 block text-sm text-muted">Review delivery activity</span>
              </Link>
              <a href="#studio-dit" className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
                <strong className="block">Production & DIT</strong>
                <span className="mt-1 block text-sm text-muted">Camera-card ingest and verified handover</span>
              </a>
            </nav>

            <section id="studio-titles" className="space-y-4 scroll-mt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-semibold">Finished films</h3>
                  <p className="mt-1 text-sm text-muted">Only titles authorized for this studio account are returned. Each title retains its current workflow status.</p>
                </div>
                <Link to="/submit-film" className="text-sm font-semibold text-accent underline underline-offset-4">Submit a finished film</Link>
              </div>
              <TitleList empty="No finished films are currently returned for this studio account." />
            </section>

            <section id="studio-concepts" className="space-y-4 scroll-mt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-semibold">Story concepts</h3>
                  <p className="mt-1 text-sm text-muted">Concept submissions remain separate from completed-film QC, rights and licensing workflows.</p>
                </div>
                <Link to="/submit-concept" className="text-sm font-semibold text-accent underline underline-offset-4">Submit a story / concept</Link>
              </div>
              <MyStoryConcepts />
            </section>

            <section id="studio-members" className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
              <div>
                <h3 className="font-display text-lg font-semibold">Members & Roles</h3>
                <p className="mt-1 text-sm text-muted">Verified organization membership is read-only here. Invitations and role changes are not currently available.</p>
              </div>
              <StudioMemberDesk />
            </section>

            <section id="studio-dit" className="scroll-mt-6">
              <details className="rounded-xl border border-line bg-surface">
                <summary className="cursor-pointer list-none p-4 sm:p-5">
                  <span className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      <strong className="block font-display text-lg">Production & DIT workspace</strong>
                      <span className="mt-1 block text-sm text-muted">Camera-card manifests, Primary and Recovery verification, and operator sign-off.</span>
                    </span>
                    <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">Open workspace</span>
                  </span>
                </summary>
                <div className="border-t border-line p-3 sm:p-5">
                  <DitAgentDesk actor={actor} />
                </div>
              </details>
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
              <span>Title visibility and all workflow actions remain server-authorized.</span>
              <Link to="/account" className="font-semibold underline underline-offset-4">Studio account settings</Link>
            </footer>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
