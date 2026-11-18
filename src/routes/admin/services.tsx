import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { RequireSuperAdminOperations } from "@/components/bridge/super-admin-operations-gate";

export const Route = createFileRoute("/admin/services")({ component: ServicesWorkspace });

function ServicesWorkspace() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Services & Operations">
          <div className="mx-auto max-w-6xl space-y-5">
            <header>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Business operations</p>
              <h2 className="mt-1 font-display text-3xl font-semibold">Services & Operations</h2>
              <p className="mt-2 text-sm text-muted">Service and production workflows remain in their existing workspaces. This page is a distinct entry point, not a duplicate control panel.</p>
            </header>
            <section className="grid gap-3 sm:grid-cols-2">
              <WorkspaceLink to="/internal" title="Distribution & Operations" detail="Existing Loop destination, delivery and operator workflows." />
              <WorkspaceLink to="/admin/workstations" title="Production Control" detail="Existing QC, rights, assets, buyer gates and delivery workstation." />
              <WorkspaceLink to="/admin" title="Commercial & Finance" detail="Existing administrative overview and finance services." />
              <WorkspaceLink to="/cms" title="Website CMS" detail="Bridge website content controls." />
            </section>
            <p className="rounded-sm border border-line p-4 text-xs text-muted">No service, QC, legal, title, payment, entitlement or publication action is executed by this entry page. Existing server-side permissions and release gates remain in force.</p>
            <Link to="/dashboard" className="inline-block border-t border-line pt-4 text-sm text-accent hover:underline">Founder Centre →</Link>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function WorkspaceLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <Link to={to as any} className="rounded-sm border border-line p-4 hover:border-accent">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{detail}</p>
      <p className="mt-3 text-xs font-semibold text-accent">Open existing workspace →</p>
    </Link>
  );
}
