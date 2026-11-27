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
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Story concepts</h2>
        <p className="mt-1 text-sm text-muted">Concepts submitted by this studio, shown separately from finished films.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {concepts.map((c) => {
          const logline = listLogline(c.logline);
          const title = (c as { titleName?: string }).titleName ?? "Concept";
          return (
            <Link
              key={c.id}
              to="/title/$id"
              params={{ id: c.title_id }}
              className="group overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg"
            >
              <div className="flex aspect-[16/10] flex-col justify-between bg-gradient-to-br from-violet-950 via-indigo-800 to-slate-700 p-5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Story / Concept</span>
                <h3 className="line-clamp-2 font-display text-2xl font-semibold text-white">{title}</h3>
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">{STATUS_LABEL[c.curation_status] ?? c.curation_status}</span>
                  <span className="text-xs font-semibold text-accent group-hover:underline">Open →</span>
                </div>
                {logline ? <p className="text-sm leading-6 text-muted">{logline}</p> : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
