import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
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

            <MyStoryConcepts />

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Your titles</h2>
                <Link to="/account" className="text-sm text-muted">
                  Account
                </Link>
              </div>
              <TitleList empty="No titles yet. Start with a new submission." />
            </section>
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
