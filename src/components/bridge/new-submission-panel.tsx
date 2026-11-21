import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { StoryConceptForm } from "@/components/bridge/story-concept-form";
import { Button } from "@/components/ui/button";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

type SubmissionPath = "none" | "finished_film" | "story_concept";

export function NewSubmissionPanel() {
  const [path, setPath] = useState<SubmissionPath>("none");

  return (
    <div className="space-y-4">
      {path === "none" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPath("finished_film")}
            className="rounded-xl border border-line bg-surface p-5 text-left transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="block text-base font-semibold">+ Add Finished Film</span>
            <span className="mt-2 block text-sm text-muted">
              Upload a completed film and start QC, rights review and delivery.
            </span>
            <span className="mt-3 block text-xs font-semibold text-accent">Start film submission →</span>
          </button>

          {STORY_CONCEPT_ENABLED ? (
            <button
              type="button"
              onClick={() => setPath("story_concept")}
              className="rounded-xl border border-line bg-surface p-5 text-left transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="block text-base font-semibold">+ Submit Story / Concept</span>
              <span className="mt-2 block text-sm text-muted">
                Share a script or idea for Bridge admin review and industry discovery.
              </span>
              <span className="mt-3 block text-xs font-semibold text-accent">Start concept submission →</span>
            </button>
          ) : (
            <div className="rounded-xl border border-dashed border-line p-5 opacity-70">
              <span className="block text-base font-semibold">Story / Concept</span>
              <span className="mt-2 block text-sm text-muted">
                Not available yet. Finished-film submissions are open.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {path === "finished_film" ? "New finished-film submission" : "New story / concept submission"}
            </p>
            <Button type="button" variant="outline" onClick={() => setPath("none")}>
              Back
            </Button>
          </div>

          {path === "finished_film" ? (
            <div className="mt-4">
              <CreateTitleForm concise />
              <p className="mt-3 text-xs text-muted">
                Need more detail?{" "}
                <Link to="/submit-film" className="underline underline-offset-2">
                  Open detailed submission
                </Link>
              </p>
            </div>
          ) : STORY_CONCEPT_ENABLED ? (
            <div className="mt-4">
              <p className="mb-3 text-sm text-muted">
                Your idea goes to Bridge for review. It is not published to Crayons Loop automatically.
              </p>
              <StoryConceptForm />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
