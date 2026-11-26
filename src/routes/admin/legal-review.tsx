import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import type { BridgeActor } from "@/lib/bridge/session";
import { decideIndependentLegalCase, listIndependentLegalCases } from "@/lib/bridge/internal-workflows";

export const Route = createFileRoute("/admin/legal-review")({ component: LegalReview });

function LegalReview() {
  return <RequireBridge allow="internal">
    {(actor) => <BridgeShell actor={actor} title="Independent Legal Review"><LegalBody actor={actor} /></BridgeShell>}
  </RequireBridge>;
}

function LegalBody({ actor }: { actor: BridgeActor }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["independent-legal-cases"], queryFn: () => listIndependentLegalCases() });
  const [notes, setNotes] = useState<Record<string,string>>({});
  const mutation = useMutation({
    mutationFn: decideIndependentLegalCase,
    onSuccess: () => client.invalidateQueries({ queryKey: ["independent-legal-cases"] }),
  });
  if (actor.internalRole !== "legal_reviewer") return <p className="p-6 text-sm">This desk is restricted to the independent Legal Reviewer role.</p>;
  if (query.isLoading) return <p className="p-6 text-sm">Loading Legal queue…</p>;
  if (query.isError) return <p className="p-6 text-sm">Unable to load Legal review cases.</p>;
  const rows = query.data ?? [];
  return <div className="space-y-4">
    <header className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-2xl font-semibold">Independent Legal decisions</h2>
      <p className="mt-2 text-sm text-muted">Legal decisions are recorded independently. They do not publish titles or approve the commercial rights grant.</p>
    </header>
    {rows.length === 0 ? <p className="rounded-xl border border-line p-5 text-sm">No pending Legal cases.</p> : rows.map((row: any) => {
      const note = notes[row.legal_case_id] ?? "";
      const evidence = Array.isArray(row.evidence) ? row.evidence : [];
      return <section key={row.legal_case_id} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="font-semibold">{row.title_name}</h3><p className="text-xs text-muted">{row.title_id} · {row.legal_status}</p></div>
          <span className="text-xs text-muted">Grant: {row.grant_status ?? "Needs linkage"}</span>
        </div>
        <p className="text-sm">Classification: {row.classification ?? "Not classified"}</p>
        <p className="text-xs text-muted">Evidence on file: {evidence.length}</p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-elevated p-3 text-xs">{JSON.stringify(evidence, null, 2)}</pre>
        <textarea value={note} onChange={(e) => setNotes((v) => ({ ...v, [row.legal_case_id]: e.target.value }))} rows={3} maxLength={2000} placeholder="Record the legal basis or evidence gap (minimum 8 characters)" className="w-full rounded-xl border border-line bg-elevated p-3 text-sm" />
        <div className="flex flex-wrap gap-2">
          {(["APPROVE","REJECT","ACTION_REQUIRED"] as const).map((decision) => <button key={decision} disabled={mutation.isPending || note.trim().length < 8} onClick={() => mutation.mutate({ data: { titleId: row.title_id, legalCaseId: row.legal_case_id, decision, note: note.trim() } })} className="rounded-full border border-line px-4 py-2 text-xs font-semibold disabled:opacity-40">{decision.replace("_"," ")}</button>)}
        </div>
      </section>;
    })}
    {mutation.isError ? <p className="rounded-xl border border-line p-3 text-sm">Decision failed: {String(mutation.error)}</p> : null}
  </div>;
}
