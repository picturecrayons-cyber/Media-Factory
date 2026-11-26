import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import type { BridgeActor } from "@/lib/bridge/session";
import { classifyBridgeTitleRecord, listTitlesForClassification } from "@/lib/bridge/internal-workflows";

export const Route = createFileRoute("/admin/classification")({ component: ClassificationDesk });

function ClassificationDesk() {
  return <RequireBridge allow="internal">
    {(actor) => <BridgeShell actor={actor} title="Title Record Classification"><ClassificationBody actor={actor} /></BridgeShell>}
  </RequireBridge>;
}

function ClassificationBody({ actor }: { actor: BridgeActor }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["bridge-title-classification"], queryFn: () => listTitlesForClassification() });
  const [values, setValues] = useState<Record<string,string>>({});
  const [reasons, setReasons] = useState<Record<string,string>>({});
  const mutation = useMutation({ mutationFn: classifyBridgeTitleRecord, onSuccess: () => client.invalidateQueries({ queryKey: ["bridge-title-classification"] }) });
  if (actor.internalRole !== "super_admin") return <p className="p-6 text-sm">Classification is restricted to Super Admin.</p>;
  if (query.isLoading) return <p className="p-6 text-sm">Loading title records…</p>;
  if (query.isError) return <p className="p-6 text-sm">Unable to load classification records.</p>;
  return <div className="space-y-4">
    <header className="rounded-2xl border border-line bg-surface p-5"><h2 className="text-2xl font-semibold">Explicit Test / Legacy Classification</h2><p className="mt-2 text-sm text-muted">Existing records remain UNCLASSIFIED until a Super Admin records a reasoned classification. This does not change title workflow status or release gates.</p></header>
    {(query.data ?? []).map((row: any) => <section key={row.id} className="grid gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[1fr_180px_1fr_auto] md:items-center">
      <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted">{row.id} · {row.status} · current: {row.record_classification}</p></div>
      <select value={values[row.id] ?? row.record_classification} onChange={(e) => setValues((v) => ({...v,[row.id]:e.target.value}))} className="rounded-xl border border-line bg-elevated p-2 text-sm"><option>UNCLASSIFIED</option><option>PRODUCTION</option><option>TEST</option><option>LEGACY</option></select>
      <input value={reasons[row.id] ?? ""} onChange={(e) => setReasons((v) => ({...v,[row.id]:e.target.value}))} placeholder="Reason (minimum 8 characters)" className="rounded-xl border border-line bg-elevated p-2 text-sm" />
      <button disabled={mutation.isPending || (reasons[row.id] ?? "").trim().length < 8 || (values[row.id] ?? row.record_classification) === row.record_classification} onClick={() => mutation.mutate({ data: { titleId: row.id, classification: (values[row.id] ?? row.record_classification) as any, reason: reasons[row.id].trim() } })} className="rounded-full border border-line px-4 py-2 text-xs font-semibold disabled:opacity-40">Save classification</button>
    </section>)}
    {mutation.isError ? <p className="rounded-xl border border-line p-3 text-sm">Classification failed: {String(mutation.error)}</p> : null}
  </div>;
}
