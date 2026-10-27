import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  listPendingStoryConcepts,
  updateStoryConceptCuration,
} from "@/lib/bridge/story-concept.server";
import type { CurationStatus } from "@/lib/bridge/story-concept";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INTRODUCED_TO_BUYERS: "Introduced to buyers",
};

export function StoryConceptDesk() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-story-concepts"],
    queryFn: () => listPendingStoryConcepts(),
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      status: CurationStatus;
      adminNotes?: string;
    }) => updateStoryConceptCuration({ data: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-story-concepts"] });
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted">Loading story concepts…</p>;
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-sm">
        Unable to load story concepts. Confirm migration is applied and you have staff access.
      </div>
    );
  }

  const concepts = query.data?.concepts ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-2xl font-semibold">Story / Concept curation</h3>
        <p className="mt-1 text-sm text-muted">
          Review submissions before any buyer or investor introduction. Nothing auto-publishes to Loop.
        </p>
      </div>

      {!concepts.length ? (
        <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
          No concepts in queue.
        </div>
      ) : (
        <div className="space-y-3">
          {concepts.map((c) => (
            <article
              key={c.id}
              className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{(c as { titleName?: string }).titleName ?? "Untitled"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                    {c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString()}` : ""}
                  </p>
                  {c.logline ? (
                    <p className="mt-3 text-sm leading-relaxed text-fg/90">{c.logline}</p>
                  ) : null}
                  {c.genre?.length ? (
                    <p className="mt-2 text-xs text-muted">{c.genre.join(" · ")}</p>
                  ) : null}
                </div>
                <Link
                  to="/title/$id"
                  params={{ id: c.title_id }}
                  className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg"
                >
                  Open title
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {c.curation_status === "PENDING" && (
                  <Button
                    size="sm"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({ id: c.id, status: "UNDER_REVIEW" })
                    }
                  >
                    Start review
                  </Button>
                )}
                {(c.curation_status === "PENDING" ||
                  c.curation_status === "UNDER_REVIEW") && (
                  <>
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: c.id, status: "APPROVED" })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: c.id, status: "REJECTED" })
                      }
                    >
                      Reject
                    </Button>
                  </>
                )}
                {c.curation_status === "APPROVED" && (
                  <Button
                    size="sm"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        id: c.id,
                        status: "INTRODUCED_TO_BUYERS",
                      })
                    }
                  >
                    Introduce to buyers / investors
                  </Button>
                )}
              </div>

              {update.isError ? (
                <p className="mt-3 text-xs text-accent">
                  {String(update.error)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
