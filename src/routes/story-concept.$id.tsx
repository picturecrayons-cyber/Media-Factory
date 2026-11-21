import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getMyStoryConcept } from "@/lib/bridge/story-concept-api";

export const Route = createFileRoute("/story-concept/$id")({ component: StoryConceptPage });

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INTRODUCED_TO_BUYERS: "Introduced to buyers",
};

function StoryConceptPage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Story / Concept">
          <StoryConceptBody titleId={id} actorType={actor.accountType} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StoryConceptBody({ titleId, actorType }: { titleId: string; actorType: string }) {
  const query = useQuery({
    queryKey: ["my-story-concept", titleId],
    queryFn: () => getMyStoryConcept({ data: { titleId } }),
    enabled: actorType === "independent_creator" || actorType === "studio",
    retry: 1,
  });

  if (actorType !== "independent_creator" && actorType !== "studio") {
    return <p role="alert" className="text-sm text-muted">Story concept not found.</p>;
  }
  if (query.isPending) return <p className="text-sm text-muted">Loading story concept…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-muted">Story concept unavailable: {query.error.message}</p>;
  const concept = query.data?.concept;
  if (!concept) return <p className="text-sm text-muted">Story concept not found.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-1 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Story & Concept</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">{concept.titleName}</h1>
          <p className="mt-2 text-sm text-muted">A concept submission is not a finished-film title, production asset, rights approval or license-ready record.</p>
        </div>
        <Link to="/creator" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Back to Creator Home</Link>
      </div>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Curation status</h2>
          <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{STATUS_LABEL[concept.curation_status] ?? concept.curation_status}</span>
        </div>
        {concept.logline ? <div className="mt-5"><h3 className="text-sm font-semibold">Logline</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">{concept.logline}</p></div> : null}
        {concept.synopsis ? <div className="mt-5"><h3 className="text-sm font-semibold">Synopsis</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">{concept.synopsis}</p></div> : null}
        {concept.genre?.length ? <div className="mt-5"><h3 className="text-sm font-semibold">Genre</h3><p className="mt-1 text-sm text-muted">{concept.genre.join(", ")}</p></div> : null}
        {concept.estimated_budget_range ? <div className="mt-5"><h3 className="text-sm font-semibold">Estimated budget</h3><p className="mt-1 text-sm text-muted">{concept.estimated_budget_range}</p></div> : null}
        {concept.target_platforms?.length ? <div className="mt-5"><h3 className="text-sm font-semibold">Target platforms</h3><p className="mt-1 text-sm text-muted">{concept.target_platforms.join(", ")}</p></div> : null}
      </section>
      <p className="text-xs text-muted">Finished-film uploads, QC, Legal review, licensing and delivery are available only through a separately created finished-film title record.</p>
    </div>
  );
}
