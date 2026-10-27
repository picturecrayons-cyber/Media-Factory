import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StreamVistaOrders } from "@/components/bridge/streamvista-orders";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="creator_studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio">
          <div className="mx-auto max-w-3xl space-y-10 px-1 pb-16">
            <header className="space-y-4">
              <div>
                <h1 className="font-display text-2xl tracking-tight sm:text-3xl">Studio</h1>
                <p className="mt-1 text-sm text-muted">
                  Your titles, rights, and delivery in one place.
                </p>
              </div>
              <NewSubmissionPanel />
            </header>

            <MyStoryConcepts />

            <section>
              <h2 className="mb-3 text-lg font-semibold">Your titles</h2>
              <TitleList empty="No titles yet. Start with a new submission." />
            </section>

            <section className="border-t border-line pt-8">
              <h2 className="text-sm font-semibold text-muted">Production services</h2>
              <p className="mt-1 text-xs text-muted">Optional. Separate from licensing.</p>
              <div className="mt-4">
                <StreamVistaOrders />
              </div>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
