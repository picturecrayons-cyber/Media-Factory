import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/story-concepts")({ component: StoryConceptListPage });

function StoryConceptListPage() {
  const query = useQuery({ queryKey: ["my-story-concepts"], queryFn: () => listMyStoryConcepts(), enabled: STORY_CONCEPT_ENABLED });
  return <RequireBridge allow="studio">{actor => <BridgeShell actor={actor} title="Story Concepts">
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
      <header><h1 className="text-2xl font-semibold">Story Concepts</h1><p className="mt-1 text-sm text-muted">Your unproduced stories and concepts awaiting curation.</p></header>
      {query.isPending ? <p>Loading concepts…</p> : query.isError ? <div role="alert"><p>Could not load concepts. No status has been assumed.</p><button onClick={() => void query.refetch()}>Retry</button></div> : !(query.data?.concepts.length) ? <p className="text-sm text-muted">No story concepts submitted yet.</p> :
        <ul className="divide-y divide-line rounded-xl border border-line">{query.data.concepts.map(c => <li key={c.id} className="p-4"><Link to={"/story-concepts/" + c.id as never} className="font-medium">{c.titleName ?? "Untitled concept"}</Link><p className="mt-1 text-sm text-muted">{c.curation_status.replaceAll("_", " ")}</p></li>)}</ul>}
    </main>
  </BridgeShell>}</RequireBridge>;
}
