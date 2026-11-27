import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  listMyIntroducedStoryConcepts,
  recordStoryConceptInterest,
} from "@/lib/bridge/story-concept-network-api";

export function StoryConceptNetworkPanel({ accountType, userId }: { accountType: "buyer" | "investor"; userId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["story-concept-network", accountType, userId],
    queryFn: () => listMyIntroducedStoryConcepts(),
    retry: false,
  });
  const interest = useMutation({
    mutationFn: (input: { conceptSubmissionId: string; interestLevel: "INTERESTED" | "REQUESTED_MATERIALS" | "PASSED" }) =>
      recordStoryConceptInterest({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["story-concept-network", accountType] }),
  });

  if (query.isPending) {
    return <p className="text-sm text-muted">Checking your invited Story / Concept opportunities…</p>;
  }
  if (query.isError) {
    return (
      <section className="rounded-sm border border-line p-4">
        <p className="text-sm text-muted">Invited Story / Concept opportunities are unavailable. Confirm your verified organization membership and retry.</p>
        <button type="button" onClick={() => void query.refetch()} className="mt-2 text-xs underline">Retry</button>
      </section>
    );
  }

  const concepts = query.data?.concepts ?? [];
  if (!concepts.length) return null;

  return (
    <section className="space-y-3 rounded-sm border border-line bg-surface p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Private introductions</p>
        <h2 className="mt-1 font-display text-xl font-semibold">Story / Concept opportunities</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          These development concepts were introduced specifically to your verified {accountType} organization. Your response is shared with Bridge for readiness review.
        </p>
      </div>
      {concepts.map((concept) => (
        <article key={concept.concept_submission_id} className="rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{concept.title_name}</h3>
              <p className="mt-1 text-xs text-muted">{concept.language} · {concept.genre?.join(" · ") || "Genre not specified"}</p>
            </div>
            <span className="rounded-full border border-line px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted">Development</span>
          </div>
          {concept.logline ? <p className="mt-3 text-sm leading-6">{concept.logline}</p> : null}
          {concept.synopsis ? <p className="mt-2 text-xs leading-5 text-muted">{concept.synopsis}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            {concept.estimated_budget_range ? <span>Budget: {concept.estimated_budget_range}</span> : null}
            {concept.target_platforms?.length ? <span>Target: {concept.target_platforms.join(" · ")}</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" disabled={interest.isPending} onClick={() => interest.mutate({ conceptSubmissionId: concept.concept_submission_id, interestLevel: "INTERESTED" })}>
              Interested
            </Button>
            <Button size="sm" variant="outline" disabled={interest.isPending} onClick={() => interest.mutate({ conceptSubmissionId: concept.concept_submission_id, interestLevel: "REQUESTED_MATERIALS" })}>
              Request materials
            </Button>
            <Button size="sm" variant="outline" disabled={interest.isPending} onClick={() => interest.mutate({ conceptSubmissionId: concept.concept_submission_id, interestLevel: "PASSED" })}>
              Pass
            </Button>
          </div>
          {interest.isError ? <p role="alert" className="mt-2 text-xs text-accent">{String(interest.error)}</p> : null}
        </article>
      ))}
    </section>
  );
}
