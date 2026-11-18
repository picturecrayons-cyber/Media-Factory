import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminWorkstations } from "@/lib/bridge/admin-workstations";

export const Route = createFileRoute("/admin/audit")({ component: AuditWorkspace });

function AuditWorkspace() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Audit & Security">
          <div className="mx-auto max-w-6xl space-y-5">
            <header>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Governance</p>
              <h2 className="mt-1 font-display text-3xl font-semibold">Audit & Security</h2>
              <p className="mt-2 text-sm text-muted">Read-only operational audit ledger. No controls here alter rights, publication or payment state.</p>
            </header>
            <AuditLedger />
            <Link to="/dashboard" className="inline-block border-t border-line pt-4 text-sm text-accent hover:underline">Founder Centre →</Link>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function AuditLedger() {
  const query = useQuery({
    queryKey: ["admin-workstations"],
    queryFn: () => listAdminWorkstations(),
    retry: 1,
  });
  if (query.isPending) return <p className="text-sm text-muted">Loading persisted audit records…</p>;
  if (query.isError || !query.data) return <p role="alert" className="rounded-sm border border-line p-4 text-sm">Audit history is unavailable. No empty state is assumed.</p>;

  const logs = query.data.audit ?? [];
  return (
    <section className="overflow-hidden rounded-sm border border-line">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-semibold">Bridge audit events</h3>
        <p className="mt-1 text-xs text-muted">Latest {logs.length} records returned by the existing, role-checked audit query.</p>
      </div>
      {logs.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr><th className="px-3 py-3">When</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">Entity</th><th className="px-3 py-3">Actor ID</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((log: any) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-3 py-3">{String(log.created_at ?? "—")}</td>
                  <td className="px-3 py-3 font-medium">{log.action}</td>
                  <td className="px-3 py-3">{log.entity_type}:{log.entity_id}</td>
                  <td className="break-all px-3 py-3 text-xs text-muted">{log.actor_user_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-4 py-8 text-center text-sm text-muted">No audit events in the returned window.</p>}
    </section>
  );
}
