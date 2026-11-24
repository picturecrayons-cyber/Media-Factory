import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { getDashboardSession } from "@/lib/bridge/session";

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
    title: "Titles & Media",
    description: "Canonical title library, Creator/Studio submissions, assets, metadata and QC.",
    to: "/workspace",
  },
  {
    title: "Rights & Legal",
    description: "Rights evidence, agreements, independent reviews and approval decisions.",
    to: "/admin/workstations",
  },
  {
    title: "Buyer Management",
    description: "Buyer release gates, licensing pipeline and title-scoped access controls.",
    to: "/admin/workstations",
  },
  {
    title: "Services & Operations",
    description: "Production service requests, vendor jobs and delivery operations.",
    to: "/deliveries",
  },
  {
    title: "Revenue & Finance",
    description: "Commercial pipeline and persisted delivery records. Reconciled cash revenue remains unverified until a finance ledger is connected.",
    to: "/admin/workstations",
  },
  {
    title: "People & Access",
    description: "Internal roles, invitations and controlled organization access.",
    to: "/internal",
  },
  {
    title: "Website CMS",
    description: "Edit the Bridge public website. This does not manage the Loop consumer application.",
    to: "/admin-cms",
  },
  {
    title: "Audit & Security",
    description: "Read-only persisted operator history and operational evidence.",
    to: "/admin/workstations",
  },
] as const;

const ACTION_GUIDANCE: Record<string, string> = {
  PREPARING: "Submission and intake work is pending",
  QC_REVIEW: "Technical QC decision is pending",
  RIGHTS_REVIEW: "Rights and legal clearance is pending",
  LICENSING_READY: "Commercial licensing action is pending",
};

function DashboardBody() {
  const dashboardQ = useQuery({
    queryKey: ["bridge-dashboard-session"],
    queryFn: () => getDashboardSession(),
    retry: false,
  });
  const titlesQ = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
    enabled: dashboardQ.isSuccess,
    retry: 1,
  });

  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking private Founder access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Founder access could not be verified. No dashboard data is shown.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const actionItems = titles.filter((title) => title.status in ACTION_GUIDANCE);
  const commercialPipeline = titles.filter((title) =>
    ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
  ).length;
  const readyToList = titles.filter((title) => title.status === "LICENSING_READY").length;
  const activeDeals = titles.filter((title) =>
    title.status === "LICENSED" || title.status === "IN_NEGOTIATION",
  ).length;
  const reportingUnavailable = titlesQ.isError;
  const metricValue = (value: number) =>
    titlesQ.isPending ? "Loading…" : reportingUnavailable ? "Unavailable" : String(value);

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Private Founder workspace · StreamVista OPC PVT LTD
          </p>
          <h2 className="font-display text-3xl font-semibold">Founder command centre</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Direct operations, clear blockers, grow the licensing pipeline and retain control of every authorization decision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/workstations" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">
            Open operations
          </Link>
          <Link to="/buyer" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">
            Open buyer desk
          </Link>
        </div>
      </section>

      <section aria-labelledby="today-title" className="rounded-sm border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
          <div>
            <h3 id="today-title" className="font-display text-xl font-semibold">Founder decision queue</h3>
            <p className="mt-1 text-sm text-muted">
              Intake, QC, rights and licensing items that need an accountable next action.
            </p>
          </div>
          <p className="text-sm font-semibold">{titlesQ.isPending ? "Loading…" : reportingUnavailable ? "Unavailable" : `${actionItems.length} pending`}</p>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-6 text-sm text-muted">Loading the operational queue…</p>
        ) : reportingUnavailable ? (
          <p role="alert" className="px-4 py-6 text-sm text-accent">
            The title queue could not be loaded. Retry before making an operational decision.
          </p>
        ) : actionItems.length ? (
          <ul className="divide-y divide-line">
            {actionItems.slice(0, 8).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{title.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {ACTION_GUIDANCE[title.status]} · {title.status.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
                <Link to="/title/$id" params={{ id: title.id }} className="shrink-0 text-sm font-semibold text-accent hover:underline">
                  Open decision record →
                </Link>
              </li>
            ))}
            {actionItems.length > 8 ? (
              <li className="px-4 py-3 text-sm text-muted">
                Showing 8 of {actionItems.length}. <Link to="/workspace" className="font-semibold text-accent hover:underline">View all titles</Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="px-4 py-6">
            <p className="font-medium">No title decision is waiting in these states.</p>
            <p className="mt-1 text-sm text-muted">
              This does not certify the catalogue as release-ready. Check the title workspace for other workflow states and evidence.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="business-title" className="space-y-3">
        <div>
          <h3 id="business-title" className="font-display text-xl font-semibold">Business & revenue control</h3>
          <p className="mt-1 text-sm text-muted">
            Operational pipeline counts are shown separately from recognized revenue and cash settlement.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Commercial pipeline" value={metricValue(commercialPipeline)} detail="Titles in commercial stages" />
          <Stat label="Ready for licensing" value={metricValue(readyToList)} detail="Awaiting commercial action" />
          <Stat label="Negotiating / licensed" value={metricValue(activeDeals)} detail="Title workflow states" />
          <Stat label="Reconciled cash revenue" value="Not verified" detail="No authoritative ledger metric is connected to this dashboard" />
        </div>
        <div className="rounded-sm border border-line px-4 py-3">
          <p className="text-sm font-medium">Revenue reporting control</p>
          <p className="mt-1 text-sm text-muted">
            Do not treat title licensing-fee metadata, orders or payment captures as recognized revenue or payable settlements. Revenue must be reported from reconciled payment, refund, chargeback and settlement records.
          </p>
          <Link to="/buyer" className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">Open commercial pipeline →</Link>
        </div>
      </section>

      <section aria-labelledby="workspaces-title" className="space-y-3">
        <div>
          <h3 id="workspaces-title" className="font-display text-xl font-semibold">Business workspaces</h3>
          <p className="mt-1 text-sm text-muted">
            Executive overview stays here; detailed records open in their dedicated, server-authorized Bridge workspaces.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ADMIN_MODULES.map((module) => (
            <Link key={module.title} to={module.to} search={"search" in module ? module.search : undefined} className="group rounded-sm border border-line p-4 transition-colors hover:border-accent">
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

      <section aria-labelledby="recent-title-records" className="rounded-sm border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 id="recent-title-records" className="font-semibold">Recent title activity</h3>
            <p className="text-xs text-muted">Latest canonical title records. Internal IDs are kept out of the overview.</p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">View title register →</Link>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-6 text-sm text-muted">Loading title records…</p>
        ) : reportingUnavailable ? (
          <p role="alert" className="px-4 py-6 text-sm text-accent">Title records could not be loaded. Refresh to retry.</p>
        ) : (
          <ul className="divide-y divide-line">
            {titles.slice(0, 6).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link to="/title/$id" params={{ id: title.id }} className="min-w-0 font-medium hover:text-accent">{title.name}</Link>
                <span className="shrink-0 rounded-sm border border-line px-2 py-1 text-xs text-muted">
                  {title.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </li>
            ))}
            {!titles.length ? <li className="px-4 py-6 text-sm text-muted">No title records were returned by the canonical query.</li> : null}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-sm border border-line px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
