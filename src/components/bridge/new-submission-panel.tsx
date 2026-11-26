import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { StoryConceptForm } from "@/components/bridge/story-concept-form";
import { Button } from "@/components/ui/button";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

type SubmissionPath = "none" | "finished_film" | "story_concept";

export function NewSubmissionPanel() {
  const [path, setPath] = useState<SubmissionPath>("none");

  if (path === "none") {
    return (
      <div className="flex justify-end">
        <Button type="button" onClick={() => setPath("finished_film")} className="rounded-full px-6">
          + New submission
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Choose submission type</p>
        <button
          type="button"
          onClick={() => setPath("none")}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPath("finished_film")}
          className={`rounded-xl border p-4 text-left transition ${
            path === "finished_film" ? "border-fg bg-fg/5" : "border-line hover:border-line-strong"
          }`}
        >
          <p className="font-medium">Finished Film</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Free path. Record → QC → Rights → License → Deliver.
          </p>
        </button>

        {STORY_CONCEPT_ENABLED ? (
          <button
            type="button"
            onClick={() => setPath("story_concept")}
            className={`rounded-xl border p-4 text-left transition ${
              path === "story_concept" ? "border-fg bg-fg/5" : "border-line hover:border-line-strong"
            }`}
          >
            <p className="font-medium">Story / Concept</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Network submission. Admin curation → buyers & investors.
            </p>
          </button>
        ) : (
          <div className="rounded-xl border border-dashed border-line p-4 text-left opacity-60">
            <p className="font-medium">Story / Concept</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Coming soon. Enable after migration + STORY_CONCEPT_ENABLED.
            </p>
          </div>
        )}
      </div>

      {path === "finished_film" && (
        <div className="mt-6 border-t border-line pt-6">
          <h2 className="text-sm font-semibold">Add finished title</h2>
          <div className="mt-3">
            <CreateTitleForm concise />
          </div>
          <p className="mt-3 text-xs text-muted">
            Prefer the full rights-ready form?{" "}
            <Link to="/submit-film" className="underline underline-offset-2">
              Open detailed submission
            </Link>
          </p>
        </div>
      )}

      {path === "story_concept" && STORY_CONCEPT_ENABLED && (
        <div className="mt-6 border-t border-line pt-6">
          <h2 className="text-sm font-semibold">Story / Concept</h2>
          <p className="mt-1 text-xs text-muted">
            Submit for admin curation. Not published to Loop automatically.
          </p>
          <div className="mt-4">
            <StoryConceptForm />
          </div>
        </div>
      )}
    </div>
  );
}
