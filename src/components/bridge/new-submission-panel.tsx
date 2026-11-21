import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { StoryConceptForm } from "@/components/bridge/story-concept-form";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

type SubmissionPath = "none" | "finished_film" | "story_concept";

export function NewSubmissionPanel() {
  const [path, setPath] = useState<SubmissionPath>("none");

  return (
    <section aria-label="Studio submissions" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPath(path === "finished_film" ? "none" : "finished_film")}
          aria-expanded={path === "finished_film"}
          className="rounded-xl border-2 border-accent bg-surface p-5 text-left transition hover:bg-accent/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="block text-base font-semibold">+ Find a Buyer — Finished Film</span>
          <span className="mt-2 block text-sm text-muted">
            Submit your completed film for QC, rights review and buyer discovery.
          </span>
          <span className="mt-3 inline-block text-xs font-semibold text-accent">Free film submission</span>
        </button>
        <button
          type="button"
          onClick={() => setPath(path === "story_concept" ? "none" : "story_concept")}
          aria-expanded={path === "story_concept"}
          disabled={!STORY_CONCEPT_ENABLED}
          className="rounded-xl border-2 border-accent bg-surface p-5 text-left transition hover:bg-accent/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="block text-base font-semibold">+ Find a Producer / Investor — Story or Concept</span>
          <span className="mt-2 block text-sm text-muted">
            Share a script, story or concept for Bridge admin review and producer / investor discovery.
          </span>
          <span className="mt-3 inline-block text-xs font-semibold text-accent">
            {STORY_CONCEPT_ENABLED ? "Story / concept submission" : "Coming soon — submission is not enabled"}
          </span>
        </button>
      </div>

      {path !== "none" && (
        <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{path === "finished_film" ? "Add finished film" : "Submit story / concept"}</h3>
            <button type="button" onClick={() => setPath("none")} className="text-sm text-muted underline underline-offset-2">
              Back to choices
            </button>
          </div>
          {path === "finished_film" ? (
            <div className="mt-4">
              <CreateTitleForm concise />
              <p className="mt-3 text-xs text-muted">
                Need the full rights-ready form?{" "}
                <Link to="/submit-film" className="underline underline-offset-2">Open detailed submission</Link>
              </p>
            </div>
          ) : STORY_CONCEPT_ENABLED ? (
            <div className="mt-4">
              <p className="text-xs text-muted">Admin curation comes first. Submission does not automatically publish to Crayons Loop.</p>
              <div className="mt-4"><StoryConceptForm /></div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
