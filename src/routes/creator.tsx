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
        <CreatorWorkspace
          actor={actor}
          displayName={actor.displayName}
        />
      )}
    </RequireBridge>
  );
}

function CreatorWorkspace({
  actor,
  displayName,
}: {
  actor: Parameters<typeof BridgeShell>[0]["actor"];
  displayName: string;
}) {
  const conceptsQ = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
  });
  const conceptTitleIds = (conceptsQ.data?.concepts ?? []).map((concept) => concept.title_id);

  return (
    <BridgeShell actor={actor} title="Creator workspace">
      <div className="mx-auto max-w-5xl space-y-8 pb-16">
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Independent creator</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Welcome{displayName ? `, ${displayName}` : ""}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Your submissions, review feedback and delivery progress in one place. You can update your own records; approvals stay with authorized Bridge teams.
            </p>
          </div>
          <div className="shrink-0"><NewSubmissionPanel /></div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Creator workflow">
          {[
            ["01", "Submit", "Create a finished-film or story-concept record."],
            ["02", "Review", "Track QC, rights and any requested revisions."],
            ["03", "Deliver", "Follow authorized licensing and delivery progress."],
          ].map(([number, title, description]) => (
            <article key={number} className="rounded-xl border border-line p-4">
              <p className="font-mono text-xs text-accent">{number}</p>
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
            </article>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Your finished-film submissions</h2>
              <p className="mt-1 text-sm text-muted">Only titles available to your Creator account are listed.</p>
            </div>
            <Link to="/account" className="text-sm text-muted underline-offset-4 hover:underline">Account settings</Link>
          </div>
          <TitleList
            empty="No finished-film submissions yet. Use New submission to get started."
            excludeIds={conceptTitleIds}
          />
        </section>

        <MyStoryConcepts />
      </div>
    </BridgeShell>
  );
}
