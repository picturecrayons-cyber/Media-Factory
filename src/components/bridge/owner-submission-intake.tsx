import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideOwnerSubmission, listOwnerSubmissionIntake } from "@/lib/bridge/owner-submissions";

export function OwnerSubmissionIntake() {
  const qc = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ["owner-submission-intake"], queryFn: () => listOwnerSubmissionIntake(), staleTime: 15_000 });
  const mutation = useMutation({
    mutationFn: (input: { titleId: string; action: "ACCEPTED_INTAKE" | "REQUEST_CHANGES" | "REJECTED" }) =>
      decideOwnerSubmission({ data: { ...input, reason: reasons[input.titleId]?.trim() ?? "" } }),
    onSuccess: () => { toast("Intake decision recorded"); void qc.invalidateQueries({ queryKey: ["owner-submission-intake"] }); void qc.invalidateQueries({ queryKey: ["bridge-audit"] }); },
    onError: (error) => toast(error instanceof Error ? error.message : "Decision failed"),
  });
  if (query.isPending) return <p className="text-sm text-muted">Loading owner submissions…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-accent">Owner submission queue could not be loaded.</p>;
  const items = query.data?.submissions ?? [];
  return <section className="space-y-4">
    <div><h2 className="font-display text-2xl font-semibold">Submission Intake</h2><p className="text-xs text-muted">Canonical owner submissions only. Accepting intake does not approve QC, Rights, Legal, licensing or delivery.</p></div>
    {!items.length ? <p className="rounded-xl border border-line p-5 text-sm text-muted">No submitted owner items.</p> : <div className="space-y-3">
      {items.map((item: any) => <article key={item.id} className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{item.title_name}</p><p className="text-xs text-muted">{item.submission_type?.replaceAll("_"," ")} · {item.owner_name || item.owner_email}</p></div><span className="text-xs font-mono">{item.submission_status}</span></div>
        <details><summary className="cursor-pointer text-xs text-muted">View submitted details</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-elevated p-3 text-xs">{typeof item.details === "string" ? JSON.stringify(JSON.parse(item.details), null, 2) : JSON.stringify(item.details, null, 2)}</pre></details>
        {item.submission_status === "SUBMITTED" ? <>
          <label className="block text-xs text-muted">Decision reason (required)<textarea rows={2} value={reasons[item.title_id] ?? ""} onChange={e => setReasons(v => ({ ...v, [item.title_id]: e.target.value }))} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated p-2 text-sm" /></label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={mutation.isPending || (reasons[item.title_id] ?? "").trim().length < 5} onClick={() => mutation.mutate({titleId:item.title_id,action:"ACCEPTED_INTAKE"})}>Accept Intake</Button>
            <Button size="sm" variant="outline" disabled={mutation.isPending || (reasons[item.title_id] ?? "").trim().length < 5} onClick={() => mutation.mutate({titleId:item.title_id,action:"REQUEST_CHANGES"})}>Return for Correction</Button>
            <Button size="sm" variant="danger" disabled={mutation.isPending || (reasons[item.title_id] ?? "").trim().length < 5} onClick={() => mutation.mutate({titleId:item.title_id,action:"REJECTED"})}>Reject</Button>
          </div>
        </> : null}
      </article>)}
    </div>}
  </section>;
}
