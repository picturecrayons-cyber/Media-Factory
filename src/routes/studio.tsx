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
          <div className="mx-auto max-w-3xl space-y-10 px-1 pb-16">
            <header className="space-y-4">
              <p className="max-w-xl text-sm text-muted">
                Choose the right submission pathway. Finished films and unproduced story concepts have separate workspaces and review processes.
              </p>
              <NewSubmissionPanel />
            </header>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Finished films</h2>
              <TitleList empty="No finished films yet. Start with a new submission." />
            </section>

            <MyStoryConcepts />
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
