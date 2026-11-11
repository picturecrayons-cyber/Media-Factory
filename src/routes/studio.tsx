import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { DitAgentPanel } from "@/components/bridge/dit-agent-panel";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio">
          <div className="mx-auto max-w-4xl space-y-10 px-1 pb-16">
            <header className="space-y-4">
              <p className="max-w-xl text-sm text-muted">
                Finished films and story concepts stay separate. Manage production intake and DIT operations from this studio workspace.
              </p>
              <NewSubmissionPanel />
            </header>

            <DitAgentPanel />

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
