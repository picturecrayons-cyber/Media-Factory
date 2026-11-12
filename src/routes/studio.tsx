import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { CreatorStorageWorkspace } from "@/components/bridge/creator-storage-workspace";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  const [activeTab, setActiveTab] = useState<"finished" | "story" | "storage">("finished");
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

            <nav aria-label="Studio workspace sections" className="flex flex-wrap gap-2 border-b border-line pb-3">
              <button type="button" onClick={() => setActiveTab("finished")} aria-pressed={activeTab === "finished"} className={activeTab === "finished" ? "rounded-full border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent" : "rounded-full border border-line px-4 py-2 text-sm font-medium text-muted"}>Finished</button>
              <button type="button" onClick={() => setActiveTab("story")} aria-pressed={activeTab === "story"} className={activeTab === "story" ? "rounded-full border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent" : "rounded-full border border-line px-4 py-2 text-sm font-medium text-muted"}>Story</button>
              <button type="button" onClick={() => setActiveTab("storage")} aria-pressed={activeTab === "storage"} className={activeTab === "storage" ? "rounded-full border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent" : "rounded-full border border-line px-4 py-2 text-sm font-medium text-muted"}>Storage</button>
            </nav>
            {activeTab === "finished" ? <section><h2 className="mb-3 text-lg font-semibold">Finished films & title pipeline</h2><TitleList empty="No finished films yet. Start with a new submission." /></section> : null}
            {activeTab === "story" ? <MyStoryConcepts /> : null}
            {activeTab === "storage" ? <CreatorStorageWorkspace /> : null}
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
