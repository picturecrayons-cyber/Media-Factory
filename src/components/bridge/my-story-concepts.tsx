import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  listMyStoryConcepts,
  submitStoryConceptToSuperAdmin,
  updateStoryConceptOwnerDetails,
} from "@/lib/bridge/story-concept-api";
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
  const query = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
  });
  const submit = useMutation({
    mutationFn: (titleId: string) => submitStoryConceptToSuperAdmin({ data: { titleId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-story-concepts"] }),
  });

  if (!STORY_CONCEPT_ENABLED) return null;
  if (query.isLoading) return <p className="text-sm text-muted">Loading concepts…</p>;
  if (query.isError) return null;

  const concepts = query.data?.concepts ?? [];
  if (!concepts.length) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Story / Concepts</h2>
      <ul className="divide-y divide-line rounded-sm border border-line">
        {concepts.map((c) => {
          const logline = listLogline(c.logline);
          const ownerStatus = (c as { ownerSubmissionStatus?: string }).ownerSubmissionStatus ?? "DRAFT";
          const reason = (c as { ownerSubmissionReason?: string | null }).ownerSubmissionReason;
          return (
            <li key={c.id} className="space-y-3 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link to="/title/$id" params={{ id: c.title_id }} className="font-medium hover:text-accent">
                    {(c as { titleName?: string }).titleName ?? "Concept"}
                  </Link>
                  <p className="text-sm text-muted">
                    Owner submission: {ownerStatus.replaceAll("_", " ")} · Curation: {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                    {logline ? ` · ${logline}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {["DRAFT", "NEEDS_CORRECTION"].includes(ownerStatus) ? (
                    <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate(c.title_id)}>
                      {ownerStatus === "NEEDS_CORRECTION" ? "Resubmit to Super Admin" : "Submit to Super Admin"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {ownerStatus === "NEEDS_CORRECTION" ? (
                <div className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
                  <p>Requested changes: {reason || "Please review the Super Admin note in your submission workspace."}</p>
                  <StoryConceptCorrectionEditor concept={c} onSaved={() => qc.invalidateQueries({ queryKey: ["my-story-concepts"] })} />
                </div>
              ) : null}
              {ownerStatus === "SUBMITTED" ? <p className="text-xs text-muted">Submitted / Pending Super Admin review.</p> : null}
              {ownerStatus === "ACCEPTED_INTAKE" ? <p className="text-xs text-muted">Accepted into intake. Editorial, legal, rights and buyer decisions remain separate.</p> : null}
            </li>
          );
        })}
      </ul>
      {submit.isError ? <p role="alert" className="mt-2 text-sm text-red-700">{submit.error instanceof Error ? submit.error.message : "Could not submit concept."}</p> : null}
    </section>
  );
}

function StoryConceptCorrectionEditor({ concept, onSaved }: { concept: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [titleName, setTitleName] = useState(concept.titleName ?? "");
  const [logline, setLogline] = useState(concept.logline ?? "");
  const [synopsis, setSynopsis] = useState(concept.synopsis ?? "");
  const [genre, setGenre] = useState((concept.genre ?? []).join(", "));
  const [budget, setBudget] = useState(concept.estimated_budget_range ?? "");
  const [platforms, setPlatforms] = useState((concept.target_platforms ?? []).join(", "));
  const [treatmentUrl, setTreatmentUrl] = useState(concept.treatment_url ?? "");
  const [screenplayUrl, setScreenplayUrl] = useState(concept.screenplay_url ?? "");
  const save = useMutation({
    mutationFn: () => updateStoryConceptOwnerDetails({ data: {
      titleId: concept.title_id,
      titleName,
      logline,
      synopsis,
      genre: genre.split(",").map((value: string) => value.trim()).filter(Boolean),
      estimatedBudgetRange: budget || undefined,
      targetPlatforms: platforms.split(",").map((value: string) => value.trim()).filter(Boolean),
      treatmentUrl,
      screenplayUrl,
    }}),
    onSuccess: () => { setOpen(false); onSaved(); },
  });
  return (
    <div>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
        {open ? "Close editor" : "Edit requested details"}
      </Button>
      {open ? (
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <label className="text-xs sm:col-span-2">Title<input required maxLength={160} value={titleName} onChange={(event) => setTitleName(event.target.value)} className="mt-1 w-full rounded border border-line-strong bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs sm:col-span-2">Logline<input required minLength={10} maxLength={500} value={logline} onChange={(event) => setLogline(event.target.value)} className="mt-1 w-full rounded border border-line-strong bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs sm:col-span-2">Synopsis<textarea required minLength={40} maxLength={8000} rows={4} value={synopsis} onChange={(event) => setSynopsis(event.target.value)} className="mt-1 w-full rounded border border-line-strong bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs">Genre (comma separated)<input value={genre} onChange={(event) => setGenre(event.target.value)} className="mt-1 w-full rounded border border-line-strong bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs">Estimated budget<input maxLength={80} value={budget} onChange={(event) => setBudget(event.target.value)} className="mt-1 w-full rounded border border-line-strong bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs">Target platforms<input value={platforms} onChange={(event) => setPlatforms(event.target.value)} className="mt-1 w-full rounded border border-line-strong bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs">Treatment URL<input type="url" value={treatmentUrl} onChange={(event) => setTreatmentUrl(event.target.value)} className="mt-1 w-full rounded border border-line-strong bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs sm:col-span-2">Screenplay URL<input type="url" value={screenplayUrl} onChange={(event) => setScreenplayUrl(event.target.value)} className="mt-1 w-full rounded border border-line-strong bg-white px-3 py-2 text-sm" /></label>
          {save.isError ? <p role="alert" className="text-xs text-red-700 sm:col-span-2">{save.error instanceof Error ? save.error.message : "Could not save changes."}</p> : null}
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save corrections"}</Button></div>
        </form>
      ) : null}
    </div>
  );
}
