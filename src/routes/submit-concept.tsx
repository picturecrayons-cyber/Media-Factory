import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StoryConceptForm } from "@/components/bridge/story-concept-form";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/submit-concept")({ component: SubmitConcept });

function SubmitConcept() {
  return (
    <RequireBridge allow="creator_or_studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Story / Concept submission">
          <main className="mx-auto max-w-3xl space-y-6">
            <header className="space-y-2">
              <Link to={actor.accountType === "studio" ? "/studio" : "/creator"} className="text-sm text-accent hover:underline">← {actor.accountType === "studio" ? "Studio Home" : "Creator Home"}</Link>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Separate submission workflow</p>
              <h1 className="font-display text-3xl font-semibold">Story / Concept</h1>
              <p className="text-sm text-muted">Submit a concept for internal curation after the configured submission fee is paid and verified. This is separate from finished-film licensing and does not publish to Loop or buyers automatically.</p>
            </header>
            {STORY_CONCEPT_ENABLED ? (
              <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                <StoryConceptForm />
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-line p-5">
                <p className="font-semibold">Coming soon</p>
                <p className="mt-1 text-sm text-muted">Story / Concept submissions are not enabled in this environment. The workflow remains unavailable until its feature flag and release checks are complete.</p>
              </section>
            )}
          </main>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
