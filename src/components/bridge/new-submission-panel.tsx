import { Link } from "@tanstack/react-router";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export function NewSubmissionPanel() {
  return (
    <section className="grid gap-4 sm:grid-cols-2" aria-label="Choose a Bridge submission product">
      <article className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Product 1</p>
        <h2 className="mt-2 text-lg font-semibold">Finished Film</h2>
        <p className="mt-2 text-sm text-muted">For an already completed film. Record → Prepare → Upload → QC → Rights → License → Deliver.</p>
        <Link to="/submit-film" className="mt-4 inline-flex rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">Submit a Finished Film</Link>
      </article>
      <article className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Product 2</p>
        <h2 className="mt-2 text-lg font-semibold">Story / Concept</h2>
        <p className="mt-2 text-sm text-muted">For an unproduced story, screenplay or concept. Submit → Admin Curation → Review → Buyer / Investor Evaluation.</p>
        {STORY_CONCEPT_ENABLED ? <Link to={"/story-concepts/new" as never} className="mt-4 inline-flex rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold">Submit a Story / Concept</Link> : <span className="mt-4 inline-flex rounded-full border border-line px-5 py-2.5 text-sm text-muted" aria-disabled="true">Story / Concept unavailable</span>}
      </article>
    </section>
  );
}
