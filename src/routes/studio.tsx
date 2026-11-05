import { createFileRoute } from "@tanstack/react-router";
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
          <div className="mx-auto max-w-5xl space-y-8 pb-16">
            <header className="flex flex-col gap-2 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Studio workspace</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Your submissions</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  Manage finished-film delivery separately from story development. Upload the film master inside its title workspace.
                </p>
              </div>
              <p className="text-xs text-muted">{actor.organizationName || "Studio account"}</p>
            </header>

            <section aria-labelledby="new-submission-heading" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="mb-4">
                <h3 id="new-submission-heading" className="text-base font-semibold">Start a submission</h3>
                <p className="mt-1 text-sm text-muted">Choose the path that matches what you are submitting.</p>
              </div>
              <NewSubmissionPanel />
            </section>

            <section aria-labelledby="finished-films-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 id="finished-films-heading" className="text-base font-semibold">Finished films</h3>
                  <p className="mt-1 text-xs text-muted">Title records moving through QC, rights, licensing and delivery.</p>
                </div>
                <span className="text-xs text-muted">Film workspace</span>
              </div>
              <TitleList
                excludeStoryConcepts
                empty="No finished films yet. Start a finished-film submission above."
              />
            </section>

            <section aria-labelledby="story-concepts-heading" className="border-t border-line pt-6">
              <div className="mb-3">
                <h3 id="story-concepts-heading" className="text-base font-semibold">Story / Concept submissions</h3>
                <p className="mt-1 text-xs text-muted">Concepts are reviewed by the Bridge admin team before any buyer or investor introduction.</p>
              </div>
              <MyStoryConcepts />
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
