import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INTRODUCED_TO_BUYERS: "Introduced",
};

function listLogline(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text.includes(" ") || !/[a-zA-Z]{3,}/.test(text)) return "";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function MyStoryConcepts() {
  const query = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
  });

  if (!STORY_CONCEPT_ENABLED) return null;
  if (query.isLoading) return <p className="text-sm text-muted">Loading concepts…</p>;
  if (query.isError) return null;

  const concepts = query.data?.concepts ?? [];
  if (!concepts.length) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Story concepts</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {concepts.map((c) => {
          const logline = listLogline(c.logline);
          return (
            <article key={c.id} className="flex min-h-36 flex-col justify-between rounded-2xl border border-line bg-surface p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Story / Concept</p>
                <Link to="/title/$id" params={{ id: c.title_id }} className="mt-2 block font-semibold hover:text-accent">
                  {(c as { titleName?: string }).titleName ?? "Concept"}
                </Link>
                {logline ? <p className="mt-2 text-sm text-muted">{logline}</p> : null}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="text-xs text-muted">{STATUS_LABEL[c.curation_status] ?? c.curation_status}</span>
                <Link to="/title/$id" params={{ id: c.title_id }} className="text-sm font-semibold text-accent">Open →</Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
