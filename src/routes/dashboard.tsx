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
        <BridgeShell actor={actor} title="Founder Centre">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

const ACTION_GUIDANCE: Record<string, string> = {
  PREPARING: "Intake",
  QC_REVIEW: "QC",
  RIGHTS_REVIEW: "Rights",
  LICENSING_READY: "Licensing",
};

const WORKSPACES = [
  { label: "Titles", to: "/workspace" },
  { label: "Rights", to: "/admin/workstations", search: { tab: "Rights" } },
  { label: "Buyer Desk", to: "/admin/workstations", search: { tab: "Buyers" } },
  { label: "Business Pipeline", to: "/admin/workstations", search: { tab: "Deliveries" } },
  { label: "Services", to: "/deliveries" },
  { label: "People & Access", to: "/internal" },
  { label: "Website CMS", to: "/admin-cms" },
  { label: "Audit", to: "/admin/workstations", search: { tab: "Audit" } },
] as const;

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

  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Founder access could not be verified.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const actionItems = titles.filter((title) => title.status in ACTION_GUIDANCE);
  const commercialPipeline = titles.filter((title) =>
    ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
  ).length;
  const readyToLicense = titles.filter((title) => title.status === "LICENSING_READY").length;
  const activeDeals = titles.filter((title) => ["IN_NEGOTIATION", "LICENSED"].includes(title.status)).length;
  const unavailable = titlesQ.isError;
  const metric = (value: number) => titlesQ.isPending ? "…" : unavailable ? "Unavailable" : String(value);

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">StreamVista OPC PVT LTD</p>
          <h1 className="font-display text-2xl font-semibold">Founder Centre</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/workstations" search={{ tab: "Titles" }} className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-[#041018]">Operations</Link>
          <Link to="/admin" className="rounded-md border border-line px-3 py-2 text-sm font-semibold">Admin</Link>
        </div>
      </header>

      <section aria-label="Business snapshot" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Commercial titles" value={metric(commercialPipeline)} />
        <Metric label="Ready to license" value={metric(readyToLicense)} />
        <Metric label="Deals" value={metric(activeDeals)} />
        <Metric label="Cash revenue" value="Not verified" />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Decision queue <span className="text-accent">{titlesQ.isPending ? "…" : unavailable ? "Unavailable" : actionItems.length}</span></p>
          <p className="text-xs text-muted">Intake · QC · Rights · Licensing</p>
        </div>
        <Link to="/workspace" className="shrink-0 text-sm font-semibold text-accent hover:underline">Open titles →</Link>
      </section>

      <section aria-label="Founder workspaces">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Business & control</h2>
          <span className="text-xs text-muted">Quick access</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {WORKSPACES.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              search={"search" in item ? item.search : undefined}
              className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-3 text-sm font-semibold transition-colors hover:border-accent hover:bg-elevated"
            >
              <span>{item.label}</span>
              <span aria-hidden="true" className="text-accent">→</span>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted">
        Revenue is not certified until payment, refund, chargeback and settlement records are reconciled. Buyer relationship CRM and partnership pipeline require a dedicated persisted workflow; current Buyer Desk is release control, not a contact CRM.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
