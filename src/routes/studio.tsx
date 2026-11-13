import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";

export const Route = createFileRoute("/studio")({
  head: () => ({ meta: [{ title: "studio | Crayons Bridge" }, { name: "robots", content: "noindex, nofollow" }] }),
   component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio">
          <div className="mx-auto max-w-3xl space-y-10 px-1 pb-16">
            <header className="space-y-4">
              <p className="max-w-xl text-sm text-muted">
                Finished films and story concepts stay separate. Production services are on the admin desk. The film master is uploaded from the title.
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
