import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator desk">
          <CreatorWorkspace />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function CreatorWorkspace() {
  const conceptsQ = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
    retry: false,
  });
  const conceptIds = conceptsQ.data?.concepts.map((concept) => concept.title_id) ?? [];
  const classificationReady = !STORY_CONCEPT_ENABLED || conceptsQ.isSuccess;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Creator workspace</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your titles, one clear view</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Create submissions, upload title materials, respond to QC feedback and track your delivery progress.
          </p>
        </div>
        <div className="shrink-0">
          <NewSubmissionPanel />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Creator workflow">
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">01 · Submit</p>
          <h3 className="mt-2 font-semibold">My titles</h3>
          <p className="mt-1 text-sm text-muted">Create and maintain your own title records.</p>
        </article>
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">02 · Improve</p>
          <h3 className="mt-2 font-semibold">QC & revisions</h3>
          <p className="mt-1 text-sm text-muted">Review feedback and submit requested corrections.</p>
        </article>
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">03 · Track</p>
          <h3 className="mt-2 font-semibold">Delivery & entitlements</h3>
          <p className="mt-1 text-sm text-muted">Follow delivery status and your account records.</p>
        </article>
      </section>

      <section className="space-y-3" aria-labelledby="creator-titles-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="creator-titles-title" className="font-display text-xl font-semibold">Your titles</h3>
            <p className="mt-1 text-sm text-muted">Only your own authorized title records are shown.</p>
          </div>
          <Link to="/account" className="text-sm font-semibold text-accent hover:underline">Account settings →</Link>
        </div>
        {classificationReady ? (
          <TitleList empty="No titles yet. Start with a new submission." excludeIds={conceptIds} />
        ) : conceptsQ.isError ? (
          <p role="alert" className="rounded-lg border border-line p-4 text-sm text-muted">
            Story-concept classification could not be verified. The title list is paused to avoid mixing submission types. Refresh to retry.
          </p>
        ) : (
          <p className="text-sm text-muted">Checking title categories…</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Story concepts</h3>
          <p className="mt-1 text-sm text-muted">A separate review path; concepts are not published automatically.</p>
        </div>
        <MyStoryConcepts />
      </section>
    </div>
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
