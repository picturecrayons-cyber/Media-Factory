import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import {
  getMyStoryConceptReview,
  markStoryConceptNotificationRead,
  resubmitStoryConceptCorrections,
} from "@/lib/bridge/story-concept-review";

export const Route = createFileRoute("/story/$id")({ component: StoryConceptReviewPage });

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  INTRODUCED_TO_BUYERS: "Introduced to buyers",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN");
}

function StoryConceptReviewPage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => {
        if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
          return <BridgeShell actor={actor} title="Story / Concept"><p className="rounded-xl border border-line p-4 text-sm">This submission view is available to its owning Creator or Studio account.</p></BridgeShell>;
        }
        return <StoryConceptReviewBody id={id} userId={actor.userId} actor={actor} />;
      }}
    </RequireBridge>
  );
}

function StoryConceptReviewBody({ id, userId, actor }: { id: string; userId: string; actor: any }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["story-concept-review", userId, id],
    queryFn: () => getMyStoryConceptReview({ data: { id } }),
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const read = useMutation({
    mutationFn: (notificationId: string) => markStoryConceptNotificationRead({ data: { id: notificationId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["story-concept-review", userId, id] }),
  });
  const concept = query.data?.concept;
  const notifications = query.data?.notifications ?? [];

  return (
    <BridgeShell actor={actor} title="Story / Concept submission">
      <main className="mx-auto max-w-4xl space-y-5 pb-16">
        <header className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Separate submission workflow</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Story / Concept Review</h1>
          <p className="mt-2 text-sm text-muted">This page tracks the Story Concept submission only. It is not a finished-film Title Workspace, service request, buyer licence or publication approval.</p>
        </header>
        {query.isPending ? <p className="text-sm text-muted">Loading your Story Concept submission…</p> : null}
        {query.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-sm text-red-600">This Story Concept is not available to the current account, or its review record could not be loaded.</p> : null}
        {concept ? (
          <>
            <section className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">Concept submission</p>
                  <h2 className="mt-1 font-display text-xl font-semibold">{concept.titleName}</h2>
                  <p className="mt-1 text-xs text-muted">Submitted {formatDate(concept.createdAt)} · Last updated {formatDate(concept.updatedAt)}</p>
                </div>
                <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{STATUS_LABEL[concept.status] ?? concept.status}</span>
              </div>
              <div className="mt-4 space-y-3">
                <div><h3 className="text-sm font-semibold">Logline</h3><p className="mt-1 text-sm text-muted">{concept.logline}</p></div>
                <div><h3 className="text-sm font-semibold">Synopsis</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{concept.synopsis}</p></div>
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  {concept.genre.map((item: string) => <span key={item} className="rounded-full border border-line px-2 py-1">{item}</span>)}
                  {concept.targetPlatforms.map((item: string) => <span key={item} className="rounded-full border border-line px-2 py-1">{item}</span>)}
                </div>
                {concept.estimatedBudgetRange ? <p className="text-sm text-muted">Budget range: {concept.estimatedBudgetRange}</p> : null}
                {concept.treatmentUrl ? <a href={concept.treatmentUrl} target="_blank" rel="noreferrer" className="block text-sm text-accent underline">Open treatment</a> : null}
                {concept.screenplayUrl ? <a href={concept.screenplayUrl} target="_blank" rel="noreferrer" className="block text-sm text-accent underline">Open screenplay</a> : null}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-semibold">Review progress</h2>
              <p className="mt-1 text-sm text-muted">Status reflects the recorded Super Admin curation decision. Approval or buyer introduction does not create a licence or guarantee a deal.</p>
              <ol className="mt-4 space-y-3 border-l border-line pl-4">
                {concept.reviewEvents.length ? concept.reviewEvents.map((event: any) => (
                  <li key={event.id} className="text-sm">
                    <strong>{STATUS_LABEL[event.toStatus] ?? event.toStatus}</strong>
                    <p className="text-xs text-muted">{formatDate(event.createdAt)}</p>
                    {event.note ? <p className="mt-1 text-sm text-muted">{event.note}</p> : null}
                  </li>
                )) : <li className="text-sm text-muted">No separate review-history entries are available for this record yet. Current status remains authoritative.</li>}
              </ol>
              {concept.introducedToBuyersAt ? <p className="mt-3 text-sm">Introduced to buyers: {formatDate(concept.introducedToBuyersAt)}</p> : null}
            </section>

            {concept.adminNotes ? (
              <section className="rounded-2xl border border-line bg-surface p-5">
                <h2 className="font-semibold">Super Admin review notes / correction request</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{concept.adminNotes}</p>
                {concept.status === "UNDER_REVIEW" ? <CorrectionForm concept={concept} onSaved={() => client.invalidateQueries({ queryKey: ["story-concept-review", userId, id] })} onNotice={setNotice} onError={setError} /> : null}
              </section>
            ) : null}

            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-semibold">Notifications</h2>
              {notifications.length ? (
                <ul className="mt-3 divide-y divide-line">
                  {notifications.map((item: any) => (
                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div><p className="text-sm">{item.message}</p><p className="mt-1 text-xs text-muted">{formatDate(item.createdAt)}</p></div>
                      {!item.readAt ? <button type="button" onClick={() => read.mutate(item.id)} className="text-xs font-semibold text-accent underline">Mark read</button> : <span className="text-xs text-muted">Read</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">No Story Concept notifications are recorded for this submission.</p>}
            </section>
          </>
        ) : null}
        {notice ? <p role="status" className="rounded-lg border border-line p-3 text-sm">{notice}</p> : null}
        {error ? <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p> : null}
        <Link to={actor.accountType === "studio" ? "/studio" : "/creator"} className="inline-block text-sm font-semibold text-accent underline">Return to Creator / Studio workspace</Link>
      </main>
    </BridgeShell>
  );
}

function CorrectionForm({ concept, onSaved, onNotice, onError }: {
  concept: any;
  onSaved: () => void | Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [logline, setLogline] = useState(concept.logline ?? "");
  const [synopsis, setSynopsis] = useState(concept.synopsis ?? "");
  const [treatmentUrl, setTreatmentUrl] = useState(concept.treatmentUrl ?? "");
  const [screenplayUrl, setScreenplayUrl] = useState(concept.screenplayUrl ?? "");
  const [genre, setGenre] = useState(concept.genre.join(", "));
  const [budget, setBudget] = useState(concept.estimatedBudgetRange ?? "");
  const [platforms, setPlatforms] = useState(concept.targetPlatforms.join(", "));
  const mutation = useMutation({
    mutationFn: () => resubmitStoryConceptCorrections({
      data: {
        id: concept.id,
        logline,
        synopsis,
        treatmentUrl,
        screenplayUrl,
        genre: genre.split(",").map((value: string) => value.trim()).filter(Boolean),
        estimatedBudgetRange: budget,
        targetPlatforms: platforms.split(",").map((value: string) => value.trim()).filter(Boolean),
      },
    }),
    onSuccess: async () => { onError(""); onNotice("Corrections resubmitted. The concept has returned to the review queue."); await onSaved(); },
    onError: (reason) => onError(reason instanceof Error ? reason.message : "Correction resubmission failed"),
  });
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <h3 className="font-semibold">Resubmit requested corrections</h3>
      <div className="grid gap-3">
        <label className="space-y-1 text-xs text-muted"><span>Updated logline</span><textarea rows={2} maxLength={500} value={logline} onChange={(e) => setLogline(e.target.value)} className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-fg" /></label>
        <label className="space-y-1 text-xs text-muted"><span>Updated synopsis</span><textarea rows={5} maxLength={8000} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-fg" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-muted"><span>Treatment HTTPS URL</span><input value={treatmentUrl} onChange={(e) => setTreatmentUrl(e.target.value)} className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-fg" /></label>
          <label className="space-y-1 text-xs text-muted"><span>Screenplay HTTPS URL</span><input value={screenplayUrl} onChange={(e) => setScreenplayUrl(e.target.value)} className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-fg" /></label>
          <label className="space-y-1 text-xs text-muted"><span>Genres (comma-separated)</span><input value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-fg" /></label>
          <label className="space-y-1 text-xs text-muted"><span>Budget range</span><input value={budget} onChange={(e) => setBudget(e.target.value)} className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-fg" /></label>
          <label className="space-y-1 text-xs text-muted sm:col-span-2"><span>Target platforms (comma-separated)</span><input value={platforms} onChange={(e) => setPlatforms(e.target.value)} className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-fg" /></label>
        </div>
      </div>
      <button type="button" disabled={mutation.isPending || logline.trim().length < 10 || synopsis.trim().length < 40} onClick={() => mutation.mutate()} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
        {mutation.isPending ? "Resubmitting…" : "Resubmit corrections"}
      </button>
    </div>
  );
}
