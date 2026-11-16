import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { archiveDraftTitleAction, listArchivableDraftIds } from "@/lib/bridge/title-archive-api";
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
  const qc = useQueryClient();
  const eligibleQ = useQuery({ queryKey: ["bridge-archivable-draft-ids"], queryFn: () => listArchivableDraftIds() });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveDraftTitleAction({ data: { id } }),
    onSuccess: () => {
      toast("Story concept archived");
      void qc.invalidateQueries({ queryKey: ["my-story-concepts"] });
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void qc.invalidateQueries({ queryKey: ["bridge-archived-drafts"] });
      void qc.invalidateQueries({ queryKey: ["bridge-archivable-draft-ids"] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not archive this concept"),
  });
  const eligible = new Set(eligibleQ.data?.ids ?? []);
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
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                <Link
                  to="/title/$id"
                  params={{ id: c.title_id }}
                  className="min-w-0 flex-1 rounded-md hover:bg-fg/5"
                >
                  <p className="font-medium">{(c as { titleName?: string }).titleName ?? "Concept"}</p>
                  <p className="text-sm text-muted">
                    {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                    {logline ? ` · ${logline}` : ""}
                  </p>
                </Link>
                {(c as { titleStatus?: string }).titleStatus === "DRAFT" && eligible.has(c.title_id) && (
                  <Button type="button" size="sm" variant="outline" disabled={archiveMutation.isPending}
                    onClick={() => {
                      const confirmed = window.confirm("Archive this story concept? It will leave the active Story Concepts list and can be restored from Archived Drafts. The submission record will be retained.");
                      if (confirmed) archiveMutation.mutate(c.title_id);
                    }}>Archive</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
