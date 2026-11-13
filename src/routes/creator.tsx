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
          <div className="mx-auto max-w-3xl space-y-8 px-1 pb-16">
            <header className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Creator workspace</p>
                  <h1 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">Welcome, {actor.displayName}</h1>
                  <p className="mt-2 max-w-xl text-sm text-muted">
                    Your Creator desk is scoped to your own titles and submissions. Upload, update drafts, and track each review stage here.
                  </p>
                </div>
                <Link to="/account" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent">Account settings</Link>
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
