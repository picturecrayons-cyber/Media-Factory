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
          <div className="mx-auto w-full max-w-5xl space-y-8 px-1 pb-16 sm:space-y-10">
            <header className="grid min-w-0 gap-4">
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Studio workspace</p>
                <h1 className="font-display text-2xl font-semibold leading-tight text-fg sm:text-3xl">Your submissions</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted">
                  Finished films and story concepts stay separate. Production services are on the admin desk.
                  Upload a film master from its title workspace.
                </p>
              </div>
              <NewSubmissionPanel />
            </header>
            <section className="min-w-0 space-y-3" aria-labelledby="studio-finished-films">
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <h2 id="studio-finished-films" className="font-display text-xl font-semibold leading-tight">Finished films</h2>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    Continue incomplete drafts or review the current status of submitted films.
                  </p>
                </div>
              </div>
              <TitleList empty="No finished films yet. Start with a new submission." />
            </section>
            <section className="min-w-0"><MyStoryConcepts /></section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
