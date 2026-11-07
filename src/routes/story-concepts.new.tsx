import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StoryConceptForm } from "@/components/bridge/story-concept-form";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/story-concepts/new")({ component: NewStoryConceptPage });

function NewStoryConceptPage() {
  return <RequireBridge allow="studio">{actor => <BridgeShell actor={actor} title="Submit a Story / Concept">
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
      <header><h1 className="text-2xl font-semibold">Submit a Story / Concept</h1><p className="mt-1 text-sm text-muted">Submit an unproduced story for admin curation. This does not publish to Crayons Loop or the public buyer catalog.</p></header>
      {!STORY_CONCEPT_ENABLED ? <p role="alert">Story Concept submissions are currently unavailable.</p> : <StoryConceptForm />}
    </main>
  </BridgeShell>}</RequireBridge>;
}
