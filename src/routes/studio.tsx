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
          <div className="mx-auto max-w-4xl space-y-8 px-1 pb-16">
            <header className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Studio workspace</p>
                  <h1 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">{actor.organizationName || "Your Studio"}</h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted">
                    {actor.displayName} · Studio member workspace. Manage the company slate and submissions within your authorized organization scope.
                  </p>
                </div>
                <span className="rounded-full border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-muted">Organization-scoped</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-elevated p-3"><p className="text-xs font-semibold text-muted">Finished films</p><p className="mt-1 text-sm">Approved title workspace</p></div>
                <div className="rounded-xl bg-elevated p-3"><p className="text-xs font-semibold text-muted">Story concepts</p><p className="mt-1 text-sm">Separate submission queue</p></div>
                <div className="rounded-xl bg-elevated p-3"><p className="text-xs font-semibold text-muted">Production services</p><p className="mt-1 text-sm">Request through Bridge operations</p></div>
              </div>
              <p className="text-xs text-muted">Finished films and story concepts stay separate. Upload the film master from its title workspace; production-service access is not implied by Studio membership.</p>
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
