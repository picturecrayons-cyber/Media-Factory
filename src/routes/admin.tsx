import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AdminControlPlane,
});

function AdminControlPlane() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        if (!isAdmin) {
          return (
            <BridgeShell actor={actor} title="Admin workspace">
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-display text-xl font-semibold">Admin access required</h2>
                <p className="mt-2 max-w-xl text-sm text-muted">
                  This workspace is limited to Bridge administrators. Your role-specific workspace remains available from the sidebar.
                </p>
              </section>
            </BridgeShell>
          );
        }
        return <AdminLanding actor={actor} />;
      }}
    </RequireBridge>
  );
}

function AdminLanding({ actor }: { actor: any }) {
  const modules = [
    {
      title: "Loop Publishing Gateway",
      description: "Review rights and release gates. Bridge authorizes; Loop receives.",
      to: "/internal" as const,
      search: true,
    },
    {
      title: "Operations & approvals",
      description: "Manage intake, QC, rights and delivery work queues.",
      to: "/admin/workstations" as const,
    },
    {
      title: "Titles & media",
      description: "Open canonical title records, artwork and source assets.",
      to: "/workspace" as const,
    },
    {
      title: "People & access",
      description: "Invite internal users and review access profiles.",
      to: "/internal" as const,
    },
    {
      title: "Ingest & CMS",
      description: "Create titles and review licensing and publishing status.",
      to: "/cms" as const,
    },
  ] as const;

  return (
    <BridgeShell actor={actor} title="Admin workspace">
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Crayons Bridge · {actor.internalRole?.replaceAll("_", " ")}
        </p>
        <h2 className="font-display text-3xl font-semibold">Choose the work you need to do.</h2>
        <p className="max-w-2xl text-sm text-muted">
          One clear entry point for administration. Business metrics and decisions stay in the Super Admin control centre.
        </p>
      </section>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const className = "rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent";
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{module.title}</h3>
                <span aria-hidden="true" className="text-accent">→</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{module.description}</p>
              <p className="mt-4 text-xs font-semibold text-accent">Open workspace</p>
            </>
          );
          return "search" in module ? (
            <Link key={module.title} to="/internal" search={{ desk: "gateway" }} className={className}>
              {body}
            </Link>
          ) : (
            <Link key={module.title} to={module.to} className={className}>
              {body}
            </Link>
          );
        })}
      </section>
    </BridgeShell>
  );
}
