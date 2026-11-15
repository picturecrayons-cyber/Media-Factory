import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio workspace">
          <div className="mx-auto max-w-5xl space-y-6 px-1 pb-16">
            <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
                <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted">Manage production titles, uploads and camera-card handover in one place.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/deliveries" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Deliveries</Link>
                <Link to="/account" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Account</Link>
              </div>
            </header>

            <nav className="grid gap-3 sm:grid-cols-2" aria-label="Studio workspace shortcuts">
              <a href="#studio-titles" className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent">
                <strong>My productions</strong>
                <p className="mt-1 text-sm text-muted">Create a title and continue its upload or review status.</p>
              </a>
              <a href="#studio-dit" className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent">
                <strong>DIT & handover</strong>
                <p className="mt-1 text-sm text-muted">Register camera cards and verify Primary and Recovery copies.</p>
              </a>
            </nav>

            <section id="studio-titles" className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold">Production titles</h2>
                <p className="mt-1 text-sm text-muted">Your films and their current next step. Final QC, rights and release decisions remain controlled by Bridge reviewers.</p>
              </div>
              <NewSubmissionPanel />
              <TitleList excludeStoryConcepts empty="No production titles yet. Select New submission to add your first film." />
              <MyStoryConcepts />
            </section>

            <section id="studio-dit" className="space-y-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Production DIT</h2>
                <p className="mt-1 text-sm text-muted">Use this desk for camera-card manifests, two-copy verification and DIT sign-off.</p>
              </div>
              <DitAgentDesk actor={actor} />
            </section>

            <details id="studio-members" className="rounded-2xl border border-line bg-surface p-4">
              <summary className="cursor-pointer font-semibold">Members & roles</summary>
              <p className="mt-2 mb-3 text-sm text-muted">Organization access is shown from verified membership records. Invitations and role changes remain restricted.</p>
              <StudioMemberDesk />
            </details>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
