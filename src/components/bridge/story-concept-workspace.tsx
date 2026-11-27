import { useQuery } from "@tanstack/react-query";
import { getMyStoryConceptWorkspace } from "@/lib/bridge/story-concept-api";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved for network introduction",
  REJECTED: "Not approved",
  INTRODUCED_TO_BUYERS: "Introduced to network",
};

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-line bg-elevated/40 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}

export function StoryConceptWorkspace({
  titleId,
  titleName,
  returnPath,
  returnLabel,
}: {
  titleId: string;
  titleName: string;
  returnPath: string;
  returnLabel: string;
}) {
  const query = useQuery({
    queryKey: ["story-concept-workspace", titleId],
    queryFn: () => getMyStoryConceptWorkspace({ data: { titleId } }),
    retry: false,
  });

  if (query.isPending) {
    return <p className="text-sm text-muted">Loading Story / Concept workspace…</p>;
  }
  if (query.isError || !query.data?.concept) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p role="alert" className="text-sm text-accent">
          Story / Concept details are unavailable. Access is limited to the verified owner or authorized internal staff.
        </p>
        <button type="button" onClick={() => void query.refetch()} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold">
          Retry
        </button>
        <a href={returnPath} className="ml-3 inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold">
          {returnLabel}
        </a>
      </section>
    );
  }

  const concept = query.data.concept;
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Story / Concept workspace</p>
            <h1 className="mt-2 font-display text-2xl font-semibold">{titleName}</h1>
            <p className="mt-1 text-sm text-muted">{concept.language || "Language not specified"}</p>
          </div>
          <span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
            {STATUS_LABEL[concept.curation_status] ?? concept.curation_status}
          </span>
        </div>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-muted">
          This is a development submission, not a finished film. Film master, trailer, artwork, technical QC and Loop publishing are intentionally unavailable at this stage.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Logline" value={concept.logline} />
          <Detail label="Synopsis" value={concept.synopsis || concept.titleSynopsis} />
          <Detail label="Genre" value={concept.genre?.join(" · ")} />
          <Detail label="Estimated budget" value={concept.estimated_budget_range} />
          <Detail label="Target platforms / outcome" value={concept.target_platforms?.join(" · ")} />
          <Detail label="Submitted" value={concept.created_at ? new Date(concept.created_at).toLocaleString() : null} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          {concept.treatment_url ? <a href={concept.treatment_url} target="_blank" rel="noreferrer" className="font-semibold underline">Open treatment ↗</a> : null}
          {concept.screenplay_url ? <a href={concept.screenplay_url} target="_blank" rel="noreferrer" className="font-semibold underline">Open screenplay ↗</a> : null}
        </div>
        <a href={returnPath} className="mt-6 inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-line-strong">
          {returnLabel}
        </a>
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-semibold">Network and Production pathway</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1", "Internal curation", "Review and approval by authorized Bridge staff."],
            ["2", "Buyer / Investor introduction", "Introductions are recorded by the authorized network workflow."],
            ["3", "Readiness confirmation", "Interest and project readiness must be verified; interest alone is not approval."],
            ["4", "Production handoff", "Only after authorized readiness approval does the project enter Production."],
          ].map(([step, heading, description]) => (
            <li key={step} className="rounded-xl border border-line bg-elevated/40 p-4">
              <p className="text-xs text-muted">STEP {step}</p>
              <p className="mt-1 text-sm font-semibold">{heading}</p>
              <p className="mt-2 text-xs leading-5 text-muted">{description}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-5 text-muted">
          Current curation state: {STATUS_LABEL[concept.curation_status] ?? concept.curation_status}. No Production status, QC state, Rights approval or publication is changed by viewing this workspace.
        </p>
      </section>
    </div>
  );
}
