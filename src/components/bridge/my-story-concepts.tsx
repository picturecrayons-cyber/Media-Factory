import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending curation",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  INTRODUCED_TO_BUYERS: "Introduced to buyers",
};

function listLogline(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text.includes(" ") || !/[a-zA-Z]{3,}/.test(text)) return "";
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

export function MyStoryConcepts() {
  const query = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
    retry: 1,
  });

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Bridge product 02</p>
          <h2 className="mt-1 font-display text-lg font-semibold">Stories / Concepts</h2>
          <p className="mt-1 text-sm text-muted">Ideas, scripts and pitches in a separate curation pipeline.</p>
        </div>
        {STORY_CONCEPT_ENABLED ? <Link to="/submit-concept" className="text-sm font-semibold text-accent hover:underline">Submit Story / Concept →</Link> : null}
      </div>

      {!STORY_CONCEPT_ENABLED ? <p className="text-sm text-muted">Story / Concept intake is not enabled in this environment.</p> : null}
      {STORY_CONCEPT_ENABLED && query.isPending ? <p role="status" className="text-sm text-muted">Loading your concepts…</p> : null}
      {STORY_CONCEPT_ENABLED && query.isError ? (
        <div role="alert" className="text-sm text-muted">
          <p>Story / Concept records could not be loaded.</p>
          <button type="button" onClick={() => void query.refetch()} className="mt-1 font-semibold text-accent underline">Retry</button>
        </div>
      ) : null}
      {STORY_CONCEPT_ENABLED && !query.isPending && !query.isError ? (
        <ul className="divide-y divide-line rounded-sm border border-line">
          {(query.data?.concepts ?? []).map((concept) => {
            const logline = listLogline(concept.logline);
            return (
              <li key={concept.id}>
                <Link to="/title/$id" params={{ id: concept.title_id }} className="block px-4 py-3 hover:bg-fg/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{concept.titleName ?? "Concept"}</p>
                    <span className="text-xs text-muted">{STATUS_LABEL[concept.curation_status] ?? concept.curation_status}</span>
                  </div>
                  {logline ? <p className="mt-1 text-sm text-muted">{logline}</p> : null}
                </Link>
              </li>
            );
          })}
          {!query.data?.concepts.length ? <li className="px-4 py-5 text-sm text-muted">No Story / Concept records yet. Create the first canonical concept record.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
