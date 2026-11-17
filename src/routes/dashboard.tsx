import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import { getDashboardSession } from "@/lib/bridge/session";
import { FounderCommandCentre } from "@/components/bridge/founder-command-centre";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Founder control centre">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

const ADMIN_MODULES = [
  {
    title: "Titles & media",
    description: "Title records, metadata, artwork, uploads, QC and rights.",
    to: "/workspace",
  },
  {
    title: "Operations & approvals",
    description: "Operational review workstations and approval queues.",
    to: "/admin/workstations",
  },
  {
    title: "Buyer desk & licensing",
    description: "Buyer activity, offers and licensing workflow.",
    to: "/buyer",
  },
  {
    title: "Deliveries & services",
    description: "Delivery work and service requests.",
    to: "/deliveries",
  },
  {
    title: "People &ֻǱ˞      </section>

      <section aria-labelledby="today-title" className="rounded-sm border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
          <div>
            <h3 id="today-title" className="font-display text-xl font-semibold">Needs your attention</h3>
            <p className="mt-1 text-sm text-muted">
              Only titles in review or licensing-decision states are listed here.
            </p>
          </div>
          <p className="text-sm font-semibold">
            {titlesQ.isPending || reportingUnavailable ? "—" : actionItems.length} pending
          </p>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-6 text-sm text-muted">Loading the action queue…</p>
        ) : reportingUnavailable ? (
          <p role="alert" className="px-4 py-6 text-sm text-accent">
            The action queue could not be loaded. Refresh to retry; no zero values are assumed.
          </p>
        ) : actionItems.length ? (
          <ul className="divide-y divide-line">
            {actionItems.slice(0, 6).map((title) => (
              <li
                key={title.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{title.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {ACTION_GUIDANCE[titֻǱ˞                  : titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length}
              </p>
              <p className="mt-1 text-xs text-muted">Titles in this content lane</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="workspaces-title" className="space-y-3">
        <div>
          <h3 id="workspaces-title" className="font-display text-xl font-semibold">Workspaces</h3>
          <p className="mt-1 text-sm text-muted">
            Choose the workspace by the job you need to do. Access remains role-gated.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ADMIN_MODULES.map((module) => (
            <Link
              key={module.title}
              to={module.to}
              className="group rounded-sm border border-line p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold">{module.title}</h4>
                <span aria-hidden="true" className="text-accent">→</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{module.description}</p>
              <p className="mt-4 text-xs font-semibold text-accent">Open workspace</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="recent-title-records" className="rounded-sm bֻǱ˞