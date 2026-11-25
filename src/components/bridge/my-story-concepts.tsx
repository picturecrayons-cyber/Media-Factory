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

function formatConceptDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "date unavailable" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function listLogline(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text.includes(" ") || !/[a-zA-Z]{3,}/.test(text)) return "";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function MyStoryConcepts({ actor }: { actor: { userId: string; organizationId?: string | null } }) {
  const query = useQuery({
    queryKey: ["my-story-concepts", actor.userId, actor.organizationId ?? null],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
    refetchInterval: 60_000,
  });

  if (!STORY_CONCEPT_ENABLED) return null;
  if (query.isLoading) return <p className="text-sm text-muted">Loading concepts…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-muted">Story / Concept records are unavailable. Retry after the workspace service is restored.</p>;

  const concepts = query.data?.concepts ?? [];
  if (!concepts.length) return <p className="text-sm text-muted">No Story / Concept records are available for this account.</p>;

  return (
    <section>
      <h4 className="font-semibold">Story Network · Story / Concepts</h4>
      <p className="mt-1 text-xs text-muted">Separate network submissions for admin curation and approved buyer / investor introductions. These are not finished-film catalogue listings.</p>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
        {concepts.map((c) => {
          const logline = listLogline(c.logline);
          return (
            <li key={c.id}>
              <Link to="/title/$id" params={{ id: c.title_id }} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 hover:bg-elevated">
                <div>
                  <p className="font-medium">{(c as { titleName?: string }).titleName ?? "Concept"}</p>
                  <p className="text-xs text-muted">
                    {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                    {logline ? ` · ${logline}` : ""}
                    {c.updated_at ? ` · Updated ${formatConceptDate(c.updated_at)}` : ""}
                  </p>
                  {c.admin_notes ? <p className="mt-2 text-xs leading-relaxed text-muted">Review update: {c.admin_notes}</p> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
