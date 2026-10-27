import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept.server";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INTRODUCED_TO_BUYERS: "Introduced",
};

export function MyStoryConcepts() {
  if (!STORY_CONCEPT_ENABLED) return null;

  const query = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted">Loading concepts…</p>;
  }

  if (query.isError) {
    return null;
  }

  const concepts = query.data?.concepts ?? [];
  if (!concepts.length) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Your story / concepts</h2>
      <ul className="divide-y divide-line rounded-sm border border-line">
        {concepts.map((c) => (
          <li key={c.id}>
            <Link
              to="/title/$id"
              params={{ id: c.title_id }}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-fg/5"
            >
              <div>
                <p className="font-medium">
                  {(c as { titleName?: string }).titleName ?? "Concept"}
                </p>
                <p className="text-sm text-muted">
                  {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                  {c.logline ? ` · ${c.logline.slice(0, 80)}${c.logline.length > 80 ? "…" : ""}` : ""}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
