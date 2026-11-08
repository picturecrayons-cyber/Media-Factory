import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => <StudioWorkspace actor={actor} organizationName={actor.organizationName || "Studio workspace"} />}
    </RequireBridge>
  );
}

function StudioWorkspace({ actor, organizationName }: { actor: Parameters<typeof BridgeShell>[0]["actor"]; organizationName: string }) {
  const conceptsQ = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
  });
  const conceptTitleIds = (conceptsQ.data?.concepts ?? []).map((concept) => concept.title_id);

  return (
    <BridgeShell actor={actor} title="Studio">
      <div className="mx-auto max-w-5xl space-y-8 pb-16">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{organizationName}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Manage your studio’s title submissions and follow each title through Bridge review. Production, QC, rights and licensing decisions remain with their authorized desks.
              </p>
            </div>
            <div className="shrink-0"><NewSubmissionPanel /></div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Studio workflow">
          {[
            ["01", "Submit", "Create a finished-film or story-concept submission."],
            ["02", "Track", "Open a title to review its current status and requested actions."],
            ["03", "Respond", "Upload requested material or provide revisions when asked."],
          ].map(([number, title, description]) => (
            <article key={number} className="rounded-xl border border-line p-4">
              <p className="font-mono text-xs text-accent">{number}</p>
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
            </article>
          ))}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Finished-film submissions</h2>
            <p className="mt-1 text-sm text-muted">Your studio’s film records. Select a title to continue its workflow.</p>
          </div>
          <TitleList
            empty="No finished-film submissions yet. Use New submission to add one."
            excludeIds={conceptTitleIds}
          />
        </section>

        <MyStoryConcepts />

        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-xs leading-5 text-muted">
          Studio membership administration and DIT service booking are not exposed in this workspace yet. No placeholder controls are shown. DIT, QC, Legal, licensing and publication authority are not granted by Studio membership.
        </p>
      </div>
    </BridgeShell>
  );
}
