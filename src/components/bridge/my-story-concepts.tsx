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
      <ul className="divide-y divide-line rounded-sm border border-line">
        {concepts.map((c) => {
          const logline = listLogline(c.logline);
          return (
            <li key={c.id}>
              <Link
                to="/title/$id"
                params={{ id: c.title_id }}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-fg/5"
              >
                <div>
                  <p className="font-medium">{(c as { titleName?: string }).titleName ?? "Concept"}</p>
                  <p className="text-sm text-muted">
                    {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                    {logline ? ` · ${logline}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
