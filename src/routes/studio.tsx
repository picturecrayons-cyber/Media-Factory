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
      {(actor) => (
        <BridgeShell actor={actor} title="Studio">
          <StudioWorkspace />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StudioWorkspace() {
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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your production desk</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Manage your studio’s title submissions and story concepts. Production services, QC and rights decisions remain controlled by the authorized Bridge teams.
          </p>
        </div>
        <div className="shrink-0">
          <NewSubmissionPanel />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Studio work areas">
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">01 · Projects</p>
          <h3 className="mt-2 font-semibold">Finished films</h3>
          <p className="mt-1 text-sm text-muted">Title records, master uploads and submission status.</p>
        </article>
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">02 · Concepts</p>
          <h3 className="mt-2 font-semibold">Story concepts</h3>
          <p className="mt-1 text-sm text-muted">Separate review and curation tracking for submitted ideas.</p>
        </article>
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">03 · Operations</p>
          <h3 className="mt-2 font-semibold">Production & DIT</h3>
          <p className="mt-1 text-sm text-muted">Production-service requests and DIT sign-off are handled through the authorized Admin workflow; no Studio-side approval shortcut.</p>
        </article>
      </section>

      <section aria-labelledby="finished-films-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="finished-films-title" className="font-display text-xl font-semibold">Finished films</h3>
            <p className="mt-1 text-sm text-muted">Each title appears once in its correct workspace category.</p>
          </div>
        </div>
        {classificationReady ? (
          <TitleList
            empty="No finished films yet. Start with a new submission."
            excludeIds={conceptIds}
          />
        ) : conceptsQ.isError ? (
          <p role="alert" className="rounded-lg border border-line p-4 text-sm text-muted">
            Story-concept classification could not be verified. The finished-film list is paused to avoid showing concept records in the wrong section. Retry by refreshing this page.
          </p>
        ) : (
          <p className="text-sm text-muted">Checking title categories…</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Story concepts</h3>
          <p className="mt-1 text-sm text-muted">Kept separate from finished-film submissions.</p>
        </div>
        <MyStoryConcepts />
      </section>

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Approval boundaries</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Studio members can manage their own authorized submissions and revisions. QC approval, legal clearance, licensing, publication and buyer delivery require their designated Bridge authority.
        </p>
      </section>
    </div>
  );
}
