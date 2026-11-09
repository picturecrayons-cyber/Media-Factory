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
        <BridgeShell actor={actor} title="Studio workspace">
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
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your production desk</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Manage your studio’s authorized title submissions and story concepts. Production, QC, rights and licensing decisions remain with their designated Bridge teams.
            </p>
          </div>
          <div className="shrink-0"><NewSubmissionPanel /></div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Studio work areas">
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">01 · Projects</p>
          <h3 className="mt-2 font-semibold">Finished films</h3>
          <p className="mt-1 text-sm text-muted">Title records, materials and submission status.</p>
        </article>
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">02 · Concepts</p>
          <h3 className="mt-2 font-semibold">Story concepts</h3>
          <p className="mt-1 text-sm text-muted">Separate review and curation tracking for submitted ideas.</p>
        </article>
        <article className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">03 · Operations</p>
          <h3 className="mt-2 font-semibold">Production & DIT</h3>
          <p className="mt-1 text-sm text-muted">DIT requests and sign-off remain with the authorized Admin workflow; Studio membership does not grant approval authority.</p>
        </article>
      </section>

      <section aria-labelledby="studio-films-title" className="space-y-3">
        <div>
          <h3 id="studio-films-title" className="font-display text-xl font-semibold">Finished-film submissions</h3>
          <p className="mt-1 text-sm text-muted">Each record appears in its verified submission category.</p>
        </div>
        {classificationReady ? (
          <TitleList empty="No finished-film submissions yet. Start with a new submission." excludeIds={conceptIds} />
        ) : conceptsQ.isError ? (
          <p role="alert" className="rounded-lg border border-line p-4 text-sm text-muted">
            Story-concept classification could not be verified. The finished-film list is paused to avoid misclassifying records. Refresh to retry.
          </p>
        ) : (
          <p className="text-sm text-muted">Checking submission categories…</p>
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
          Studio members can manage only records within their authorized scope. QC approval, legal clearance, licensing, publication and buyer delivery require their designated Bridge authority.
        </p>
      </section>
    </div>
  );
}
