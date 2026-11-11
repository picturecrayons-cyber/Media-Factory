import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { listTitles } from "@/lib/bridge/titles";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/dit")({ component: DitWorkspace });

function DitWorkspace() {
  return (
    <RequireBridge allow="internal">
      {(actor) => hasPermission(actor, "dit.workspace_read") ? (
        <BridgeShell actor={actor} title="Digital Imaging Technician Desk">
          <DitQueue />
        </BridgeShell>
      ) : <Navigate to={actor.internalRole === "super_admin" ? "/dashboard" : "/internal"} replace />}
    </RequireBridge>
  );
}

function DitQueue() {
  const titlesQ = useQuery({ queryKey: ["bridge-titles", "dit-queue"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.titles ?? [];

  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading the Bridge intake queue…</p>;
  if (titlesQ.isError) return <p role="alert" className="text-sm text-muted">The intake queue is unavailable. No asset state was changed.</p>;

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-xl font-semibold">Intake & integrity queue</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          This desk is read-only until the OCI three-copy workflow and persisted evidence ledger pass their integration gates.
          It does not upload, copy, replace, delete, QC-approve, authorize rights, or release media.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Titles visible</p><p className="mt-1 text-2xl font-semibold">{titles.length}</p></div>
          <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Backup evidence</p><p className="mt-1 text-sm font-semibold">Not connected</p></div>
          <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Human sign-off ledger</p><p className="mt-1 text-sm font-semibold">Not connected</p></div>
        </div>
      </section>
      <section className="space-y-3">
        <div><h2 className="font-display text-xl font-semibold">Bridge title intake</h2><p className="text-xs text-muted">Existing title records; no production data is modified by this view.</p></div>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {titles.length ? titles.map((title) => (
            <li key={title.id}>
              <Link to="/title/$id" params={{ id: title.id }} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-elevated/50">
                <span className="font-medium">{title.name}</span><StatusChip status={title.status} />
              </Link>
            </li>
          )) : <li className="px-5 py-8 text-center text-sm text-muted">No title records are currently visible.</li>}
        </ul>
      </section>
    </div>
  );
}
