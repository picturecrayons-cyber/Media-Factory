import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

export function MyStoryConcepts() {
  const query = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
  });

  if (!STORY_CONCEPT_ENABLED) return null;
  if (query.isLoading) return <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">Loading story concepts…</div>;
  if (query.isError) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 text-sm"><p className="text-accent">Could not load story concepts.</p><Button type="button" variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>;

  const concepts = query.data?.concepts ?? [];
  if (!concepts.length) return <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-9 text-center"><BookOpen className="mx-auto h-7 w-7 text-muted" /><p className="mt-3 font-medium">No story concepts submitted yet</p><p className="mt-1 text-sm text-muted">Original ideas will appear here, separate from finished-film records.</p></div>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {concepts.map((concept) => {
        const logline = listLogline(concept.logline);
        const status = STATUS_LABEL[concept.curation_status] ?? concept.curation_status;
        return (
          <li key={concept.id}>
            <Link to="/title/$id" params={{ id: concept.title_id }} className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <span className="rounded-xl bg-[#f5f0e6] p-3 text-[#98743d]"><Lightbulb className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-fg">{(concept as { titleName?: string }).titleName ?? "Concept"}</span>
                {logline ? <span className="mt-1 block text-sm leading-5 text-muted">{logline}</span> : null}
                <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{status}</span>
              </span>
              <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
