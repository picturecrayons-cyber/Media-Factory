import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listMyEditableOwnerSubmissions, saveOwnerSubmission } from "@/lib/bridge/owner-submissions";

export function OwnerSubmissionCorrections() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["my-editable-owner-submissions"], queryFn: () => listMyEditableOwnerSubmissions() });
  const [values, setValues] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: async ({ titleId, submissionKind, submit }: { titleId: string; submissionKind: "finished_film" | "story_concept"; submit: boolean }) => {
      const raw = values[titleId];
      let details: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(raw ?? "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Submission details must be a JSON object.");
        details = parsed as Record<string, unknown>;
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Invalid submission details JSON.");
      }
      return saveOwnerSubmission({ data: { titleId, submissionKind, details, submit } });
    },
    onSuccess: async (result) => {
      toast(result.submissionStatus === "SUBMITTED" ? "Correction resubmitted for intake" : "Draft changes saved");
      await qc.invalidateQueries({ queryKey: ["my-editable-owner-submissions"] });
      await qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: error => toast(error instanceof Error ? error.message : "Could not save submission"),
  });
  if (query.isPending) return <p className="text-sm text-muted">Checking editable submissions…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-accent">Editable submissions could not be loaded.</p>;
  const items = query.data?.submissions ?? [];
  if (!items.length) return <p className="text-sm text-muted">No drafts or returned submissions need editing.</p>;
  return <section className="space-y-3">
    <div><h2 className="font-display text-xl font-semibold">Drafts & corrections</h2><p className="mt-1 text-sm text-muted">Edit the saved submission details below. Resubmission returns the item to intake only; QC, Rights, Legal and publication remain separate.</p></div>
    {items.map(item => {
      const value = values[item.title_id] ?? JSON.stringify(item.details ?? {}, null, 2);
      return <article key={item.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{item.title_name}</p><p className="text-xs text-muted">{item.submission_type.replaceAll("_", " ")} · {item.submission_status}</p></div><span className="text-xs text-muted">Editable by owner</span></div>
        <label className="block text-xs text-muted">Submission details (JSON)<textarea spellCheck={false} rows={10} value={value} onChange={event => setValues(current => ({ ...current, [item.title_id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated p-3 font-mono text-xs" /></label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ titleId: item.title_id, submissionKind: item.submission_type === "story_concept" ? "story_concept" : "finished_film", submit: false })}>Save changes</Button>
          {item.submission_status === "NEEDS_CORRECTION" ? <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ titleId: item.title_id, submissionKind: item.submission_type === "story_concept" ? "story_concept" : "finished_film", submit: true })}>Resubmit correction</Button> : null}
        </div>
      </article>;
    })}
  </section>;
}
