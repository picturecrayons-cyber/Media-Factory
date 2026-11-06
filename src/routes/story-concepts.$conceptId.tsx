import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getStoryConceptById } from "@/lib/bridge/story-concept-api";

export const Route = createFileRoute("/story-concepts/$conceptId")({ component: StoryConceptWorkspace });

function StoryConceptWorkspace() {
  const { conceptId } = Route.useParams();
  const query = useQuery({ queryKey: ["story-concept", conceptId], queryFn: () => getStoryConceptById({ data: { conceptId } }), retry: false });
  return <RequireBridge allow="studio">{actor => <BridgeShell actor={actor} title="Story Concept Workspace">
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
      {query.isPending ? <p>Loading story concept…</p> : query.isError ? <section role="alert" className="rounded-xl border border-line p-5"><h1 className="font-semibold">Concept unavailable</h1><p className="mt-2 text-sm text-muted">{query.error.message}</p><button className="mt-3 underline" onClick={() => void query.refetch()}>Retry</button></section> : query.data ? (() => {
        const c = query.data.concept;
        return <section className="space-y-5 rounded-2xl border border-line bg-surface p-5">
          <header><p className="text-xs uppercase tracking-wider text-muted">Story / Concept</p><h1 className="mt-1 text-2xl font-semibold">{c.titleName}</h1><p className="mt-1 text-sm text-muted">{c.language} · {c.curation_status.replaceAll("_", " ")}</p></header>
          <div><h2 className="text-sm font-semibold">Logline</h2><p className="mt-1 text-sm">{c.logline}</p></div>
          <div><h2 className="text-sm font-semibold">Synopsis</h2><p className="mt-1 whitespace-pre-wrap text-sm">{c.synopsis}</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><h2 className="text-sm font-semibold">Genre</h2><p className="text-sm text-muted">{c.genre.join(", ") || "—"}</p></div><div><h2 className="text-sm font-semibold">Estimated budget</h2><p className="text-sm text-muted">{c.estimated_budget_range || "—"}</p></div><div className="sm:col-span-2"><h2 className="text-sm font-semibold">Target platforms / outcome</h2><p className="text-sm text-muted">{c.target_platforms.join(", ") || "—"}</p></div></div>
          {c.treatment_url ? <p className="text-sm"><a href={c.treatment_url} target="_blank" rel="noreferrer">Open treatment</a></p> : null}
          {c.screenplay_url ? <p className="text-sm"><a href={c.screenplay_url} target="_blank" rel="noreferrer">Open screenplay</a></p> : null}
          <div className="rounded-xl border border-line p-4"><p className="text-sm font-semibold">Admin review</p><p className="mt-1 text-sm">{c.curation_status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">{c.admin_notes || "No reviewer comments."}</p></div>
          <div className="rounded-xl border border-line p-4"><p className="text-sm font-semibold">Payment certification</p><p className="mt-1 text-sm">{c.feeCertified ? "CERTIFIED" : "LOCKED — fee certification pending"}</p></div>
          <p className="text-xs text-muted">Submitted {new Date(c.created_at).toLocaleString()}. This concept is not published to Loop automatically.</p>
        </section>;
      })() : <p>Concept not found.</p>}
    </main>
  </BridgeShell>}</RequireBridge>;
}
