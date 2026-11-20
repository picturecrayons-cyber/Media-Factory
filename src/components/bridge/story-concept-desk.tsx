import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  listPendingStoryConcepts,
  reviewStoryConceptEditorial,
  reviewStoryConceptLegal,
  updateStoryConceptCuration,
} from "@/lib/bridge/story-concept-api";
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
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-story-concepts"] });
  const editorial = useMutation({
    mutationFn: (id: string) => reviewStoryConceptEditorial({ data: { id, decision: "APPROVED" } }),
    onSuccess: refresh,
  });
  const legal = useMutation({
    mutationFn: (id: string) => reviewStoryConceptLegal({ data: { id, decision: "APPROVED" } }),
    onSuccess: refresh,
  });
  const curation = useMutation({
    mutationFn: (input: { id: string; status: CurationStatus }) =>
      updateStoryConceptCuration({ data: input }),
    onSuccess: refresh,
  });

  if (query.isLoading) return <p className="text-sm text-muted">Loading Original IP submissions…</p>;
  if (query.isError) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-sm" role="alert">
        Original IP review queue is unavailable. No empty queue state is assumed.
      </div>
    );
  }

  const concepts = query.data?.concepts ?? [];
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-2xl font-semibold">Original IP · Independent review</h3>
        <p className="mt-1 text-sm text-muted">
          Editorial and Legal are separate decisions by different verified reviewers. Neither decision grants rights, licenses a title, or publishes to Loop.
        </p>
      </div>
      {!concepts.length ? (
        <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
          No active Original IP submissions in the review queue.
        </div>
      ) : (
        <div className="space-y-3">
          {concepts.map((c) => {
            const independentApproval =
              c.editorial_status === "APPROVED" &&
              c.legal_status === "APPROVED" &&
              Boolean(c.editorial_reviewed_by) &&
              Boolean(c.legal_reviewed_by) &&
              c.editorial_reviewed_by !== c.legal_reviewed_by;
            const busy = editorial.isPending || legal.isPending || curation.isPending;
            return (
              <article key={c.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{(c as { titleName?: string }).titleName ?? "Untitled"}</p>
                    <p className="mt-1 text-xs text-muted">
                      Curation: {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                      {c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString()}` : ""}
                    </p>
                    {c.logline ? <p className="mt-3 text-sm leading-relaxed text-fg/90">{c.logline}</p> : null}
                    {c.genre?.length ? <p className="mt-2 text-xs text-muted">{c.genre.join(" · ")}</p> : null}
                  </div>
                  <Link
                    to="/title/$id"
                    params={{ id: c.title_id }}
                    className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg"
                  >
                    Open title
                  </Link>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-xs font-semibold">Editorial review</p>
                    <p className="mt-1 text-xs text-muted">
                      {c.editorial_status ?? "PENDING"}
                      {c.editorial_reviewed_by ? ` · Reviewer ${c.editorial_reviewed_by}` : ""}
                    </p>
                    {c.editorial_status !== "APPROVED" && c.curation_status !== "INTRODUCED_TO_BUYERS" ? (
                      <Button size="sm" className="mt-2" disabled={busy} onClick={() => editorial.mutate(c.id)}>
                        Record Editorial approval
                      </Button>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-xs font-semibold">Legal review</p>
                    <p className="mt-1 text-xs text-muted">
                      {c.legal_status ?? "PENDING"}
                      {c.legal_reviewed_by ? ` · Reviewer ${c.legal_reviewed_by}` : ""}
                    </p>
                    {c.legal_status !== "APPROVED" && c.curation_status !== "INTRODUCED_TO_BUYERS" ? (
                      <Button size="sm" className="mt-2" disabled={busy} onClick={() => legal.mutate(c.id)}>
                        Record Legal approval
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {c.curation_status !== "APPROVED" && c.curation_status !== "INTRODUCED_TO_BUYERS" && independentApproval ? (
                    <Button size="sm" disabled={busy} onClick={() => curation.mutate({ id: c.id, status: "APPROVED" })}>
                      Approve for buyer evaluation
                    </Button>
                  ) : null}
                  {c.curation_status === "APPROVED" && c.fee_certified_at ? (
                    <Button size="sm" disabled={busy} onClick={() => curation.mutate({ id: c.id, status: "INTRODUCED_TO_BUYERS" })}>
                      Introduce to buyers / investors
                    </Button>
                  ) : c.curation_status === "APPROVED" ? (
                    <p className="self-center text-xs text-muted">Fee certification is required before buyer introduction.</p>
                  ) : null}
                </div>

                {[editorial, legal, curation].some((mutation) => mutation.isError) ? (
                  <p className="mt-3 text-xs text-accent" role="alert">
                    A review action was rejected or could not be saved. Check your reviewer role and the independent-review requirements.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
