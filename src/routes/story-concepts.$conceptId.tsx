import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getStoryConceptById } from "@/lib/bridge/story-concept-api";

export const Route = createFileRoute("/story-concepts/$conceptId")({ component: StoryConceptWorkspace });

function StoryConceptWorkspace() {
  const { conceptId } = Route.useParams();
  const query = useQuery({
    queryKey: ["story-concept", conceptId],
    queryFn: () => getStoryConceptById({ data: { conceptId } }),
    retry: false,
  });

  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Story Concept Workspace">
          <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
            {query.isPending ? <p className="text-sm text-muted">Loading story concept…</p> : null}
            {query.isError ? (
              <section role="alert" className="rounded-xl border border-line p-5">
                <h1 className="font-semibold">Concept unavailable</h1>
                <p className="mt-2 text-sm text-muted">This submission could not be loaded for the signed-in account.</p>
                <button className="mt-3 underline" onClick={() => void query.refetch()}>Retry</button>
              </section>
            ) : null}
            {query.data ? (
              <section className="space-y-5 rounded-2xl border border-line bg-surface p-5">
                <header>
                  <p className="text-xs uppercase tracking-wider text-muted">Story / Concept submission</p>
                  <h1 className="mt-1 text-2xl font-semibold">{query.data.concept.titleName}</h1>
                  <p className="mt-1 text-sm text-muted">{query.data.concept.curation_status.replaceAll("_", " ")}</p>
                  <p className="mt-1 font-mono text-xs text-muted">Submission reference: {conceptId}</p>
                </header>
                <div><h2 className="text-sm font-semibold">Logline</h2><p className="mt-1 whitespace-pre-wrap text-sm">{query.data.concept.logline || "—"}</p></div>
                <div><h2 className="text-sm font-semibold">Synopsis</h2><p className="mt-1 whitespace-pre-wrap text-sm">{query.data.concept.synopsis || "—"}</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><h2 className="text-sm font-semibold">Genre</h2><p className="text-sm text-muted">{query.data.concept.genre.join(", ") || "—"}</p></div>
                  <div><h2 className="text-sm font-semibold">Estimated budget</h2><p className="text-sm text-muted">{query.data.concept.estimated_budget_range || "—"}</p></div>
                  <div className="sm:col-span-2"><h2 className="text-sm font-semibold">Target platforms</h2><p className="text-sm text-muted">{query.data.concept.target_platforms.join(", ") || "—"}</p></div>
                </div>
                <div className="rounded-xl border border-line p-4">
                  <p className="text-sm font-semibold">Review status</p>
                  <p className="mt-1 text-sm">{query.data.concept.curation_status.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm text-muted">{query.data.concept.admin_notes || "No reviewer comments."}</p>
                </div>
                <p className="text-xs text-muted">Submitted {new Date(query.data.concept.created_at).toLocaleString()}. A Story Concept submission is not a finished-film title and is not published to Loop automatically.</p>
              </section>
            ) : null}
          </main>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
