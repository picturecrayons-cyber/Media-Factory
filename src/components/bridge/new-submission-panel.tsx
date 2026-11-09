import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, BookOpen, Clapperboard, Plus } from "lucide-react";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { StoryConceptForm } from "@/components/bridge/story-concept-form";
import { Button } from "@/components/ui/button";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

type SubmissionPath = "none" | "finished_film" | "story_concept";

export function NewSubmissionPanel() {
  const [path, setPath] = useState<SubmissionPath>("none");

  if (path === "none") {
    return (
      <Button type="button" onClick={() => setPath("finished_film")} className="h-12 w-full justify-center gap-2 rounded-xl px-6 text-sm font-semibold shadow-sm sm:w-auto">
        <Plus className="h-4 w-4" /> New submission
      </Button>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold">Choose your submission path</p><p className="mt-1 text-xs text-muted">Finished films and story concepts follow separate workflows.</p></div>
        <button type="button" onClick={() => setPath("none")} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setPath("finished_film")} className={`group rounded-2xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:p-5 ${path === "finished_film" ? "border-accent bg-accent-soft/40" : "border-line bg-surface hover:border-accent/50"}`}>
          <span className="inline-flex rounded-xl bg-[#142536] p-3 text-[#d7b878]"><Clapperboard className="h-5 w-5" /></span>
          <span className="mt-3 block font-semibold">Finished Film</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">For completed films. Create a title, add assets and submit through QC, rights, licensing and delivery.</span>
        </button>

        {STORY_CONCEPT_ENABLED ? (
          <button type="button" onClick={() => setPath("story_concept")} className={`group rounded-2xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:p-5 ${path === "story_concept" ? "border-accent bg-accent-soft/40" : "border-line bg-surface hover:border-accent/50"}`}>
            <span className="inline-flex rounded-xl bg-[#f5f0e6] p-3 text-[#98743d]"><BookOpen className="h-5 w-5" /></span>
            <span className="mt-3 block font-semibold">Story / Concept</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">For original ideas and pitches. Submit separately for Bridge admin review and curation.</span>
          </button>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-4 opacity-70 sm:p-5">
            <span className="inline-flex rounded-xl bg-elevated p-3 text-muted"><BookOpen className="h-5 w-5" /></span>
            <p className="mt-3 font-semibold">Story / Concept</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Not currently enabled for this workspace.</p>
          </div>
        )}
      </div>

      {path === "finished_film" && (
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-semibold">Create a finished-film title</h3>
          <div className="mt-3"><CreateTitleForm concise /></div>
          <p className="mt-3 text-xs text-muted">Need the full rights-ready form? <Link to="/submit-film" className="font-medium text-accent underline underline-offset-2">Open detailed submission</Link></p>
        </div>
      )}

      {path === "story_concept" && STORY_CONCEPT_ENABLED && (
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-semibold">Submit a story / concept</h3>
          <p className="mt-1 text-xs text-muted">Submission goes to admin curation. It is not automatically published to Loop.</p>
          <div className="mt-4"><StoryConceptForm /></div>
        </div>
      )}
    </div>
  );
}
