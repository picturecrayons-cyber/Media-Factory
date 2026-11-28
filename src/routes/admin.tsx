import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AdminControlPlane,
});

const ADMIN_AREAS = [
  { title: "Title library", description: "Create and find title records, artwork and master assets.", to: "/workspace", action: "Open Titles" },
  { title: "Operations & approvals", description: "Open QC, rights, legal and operational review queues.", to: "/admin/workstations", action: "Open Operations" },
  { title: "Licensing Desk", description: "Review buyer enquiries, commercial offers and broadcast partners.", to: "/licensing", action: "Open Licensing" },
  { title: "People & access", description: "Review team access and manage internal invitations.", to: "/internal", action: "Open Access" },
  { title: "Public Website CMS", description: "Edit homepage content through draft, preview, approval and publish.", to: "/admin-cms", action: "Open Website CMS" },
  { title: "Loop Gateway", description: "Check Bridge authorization and controlled Loop publication.", to: "/cms", action: "Open Loop Gateway" },
] as const;

function AdminControlPlane() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        return (
          <BridgeShell actor={actor} title="Admin Centre">
            {isAdmin ? (
              <div className="space-y-6">
                <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Administrator workspace</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold">Choose one task to work on.</h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted">The Admin Centre is a directory, not a place to perform every operation. Open the dedicated workspace for the task you need.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link to="/dashboard"><Button>Founder Centre</Button></Link>
                    <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer"><Button variant="outline">Open Crayons Loop ↗</Button></a>
                  </div>
                </section>
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {ADMIN_AREAS.map((item, index) => (
                    <Link key={item.title} to={item.to} className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent">
                      <span className="text-xs font-mono text-muted">{String(index + 1).padStart(2, "0")}</span>
                      <h3 className="mt-3 font-semibold">{item.title}</h3>
                      <p className="mt-2 min-h-10 text-sm leading-relaxed text-muted">{item.description}</p>
                      <p className="mt-4 text-sm font-semibold text-accent">{item.action} →</p>
                    </Link>
                  ))}
                </section>
                <p className="text-xs text-muted">Access remains role-gated. This page does not grant permissions, approve QC or rights, reconcile payments, or publish titles.</p>
              </div>
            ) : (
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-display text-xl font-semibold">Admin access required</h2>
                <p className="mt-2 max-w-xl text-sm text-muted">This directory is limited to Bridge administrators. Your operational workspace remains available from the navigation.</p>
              </section>
            )}
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}
