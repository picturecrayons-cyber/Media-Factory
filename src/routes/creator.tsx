import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { CreatorStorageWorkspace } from "@/components/bridge/creator-storage-workspace";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  const [activeTab, setActiveTab] = useState<"finished" | "story" | "storage">("finished");
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator desk">
          <div className="mx-auto max-w-3xl space-y-10 px-1 pb-16">
            <header className="space-y-4">
              <div>
                <h1 className="font-display text-2xl tracking-tight sm:text-3xl">Creator</h1>
                <p className="mt-1 text-sm text-muted">
                  Own titles only. Upload, update drafts, and track delivery.
                </p>
              </div>
              <NewSubmissionPanel />
            </header>

            <nav aria-label="Creator workspace sections" className="flex flex-wrap gap-2 border-b border-line pb-3">
              <button type="button" onClick={() => setActiveTab("finished")} aria-pressed={activeTab === "finished"} className={activeTab === "finished" ? "rounded-full border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent" : "rounded-full border border-line px-4 py-2 text-sm font-medium text-muted"}>Finished</button>
              <button type="button" onClick={() => setActiveTab("story")} aria-pressed={activeTab === "story"} className={activeTab === "story" ? "rounded-full border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent" : "rounded-full border border-line px-4 py-2 text-sm font-medium text-muted"}>Story</button>
              <button type="button" onClick={() => setActiveTab("storage")} aria-pressed={activeTab === "storage"} className={activeTab === "storage" ? "rounded-full border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent" : "rounded-full border border-line px-4 py-2 text-sm font-medium text-muted"}>Storage</button>
              <Link to="/account" className="ml-auto self-center text-sm text-muted">Account</Link>
            </nav>
            {activeTab === "finished" ? <section><h2 className="mb-3 text-lg font-semibold">Finished films & title pipeline</h2><TitleList empty="No titles yet. Start with a new submission." /></section> : null}
            {activeTab === "story" ? <MyStoryConcepts /> : null}
            {activeTab === "storage" ? <CreatorStorageWorkspace /> : null}
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

export function Desk({
  role,
  scope,
  opportunity,
  steps,
}: {
  role: string;
  scope: string;
  opportunity: string;
  steps: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-sm border border-line p-4">
          <p className="text-xs uppercase tracking-widest text-muted">Scope · {role}</p>
          <p className="mt-2 text-sm">{scope}</p>
        </article>
        <article className="rounded-sm border border-line p-4">
          <p className="text-xs uppercase tracking-widest text-muted">Opportunity</p>
          <p className="mt-2 text-sm">{opportunity}</p>
        </article>
      </div>
      <ol className="flex flex-wrap gap-2 text-sm">
        {steps.map((step, i) => (
          <li key={step} className="rounded-sm border border-line px-3 py-1.5">
            {i + 1}. {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
