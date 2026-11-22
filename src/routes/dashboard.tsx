import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { getDashboardSession } from "@/lib/bridge/session";
import { listAdminProfiles } from "@/lib/bridge/profiles";

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

const DECISION_STATES: Record<string, string> = {
  QC_REVIEW: "QC review",
  RIGHTS_REVIEW: "Rights review",
  LICENSING_READY: "Licensing decision",
};

function DashboardBody() {
  const session = useQuery({
    queryKey: ["bridge-dashboard-session"],
    queryFn: () => getDashboardSession(),
    retry: false,
  });
  const titlesQ = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
    enabled: session.isSuccess,
    retry: 1,
  });
  const profilesQ = useQuery({
    queryKey: ["bridge-admin-profiles"],
    queryFn: () => listAdminProfiles(),
    enabled: session.isSuccess,
    retry: 1,
  });

  if (session.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (session.isError) return <p role="alert" className="text-sm text-accent">Super Admin access required.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const needsDecision = titles.filter((title) => title.status in DECISION_STATES);
  const liveForBuyers = titles.filter((title) => title.status === "LIVE_FOR_BUYERS").length;
  const commercialDeals = titles.filter((title) =>
    ["IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
  ).length;
  const unavailable = titlesQ.isPending || titlesQ.isError;
  const profiles = profilesQ.data?.profiles ?? [];
  const organizations = new Set(profiles.map((profile) => profile.organizationName?.trim()).filter(Boolean));
  const metricValue = (count: number) => unavailable ? "—" : String(count);
  const profileMetricValue = (count: number) => profilesQ.isPending || profilesQ.isError ? "—" : String(count);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Pictures · Super Admin</p>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Founder Centre</h2>
        <p className="max-w-2xl text-sm text-muted">A clear daily overview. Open a workspace only when a decision or task needs attention.</p>
      </header>

      <section aria-label="Executive overview" className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Metric label="Master titles" value={metricValue(titles.length)} />
        <Metric label="Pending review" value={metricValue(needsDecision.length)} />
        <Metric label="Live for buyers" value={metricValue(liveForBuyers)} />
        <Metric label="Commercial deals" value={metricValue(commercialDeals)} />
        <Metric label="Bridge profiles" value={profileMetricValue(profiles.length)} />
        <Metric label="Named organizations" value={profileMetricValue(organizations.size)} />
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-labelledby="attention-heading">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 id="attention-heading" className="font-semibold">Needs attention</h3>
            <p className="mt-0.5 text-xs text-muted">Only QC, rights and licensing decisions requiring review.</p>
          </div>
          <span className="text-sm font-semibold tabular-nums">{unavailable ? "—" : needsDecision.length}</span>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-5 text-sm text-muted">Loading review queue…</p>
        ) : titlesQ.isError ? (
          <p role="alert" className="px-4 py-5 text-sm text-accent">Review data is unavailable. Counts are not assumed to be zero.</p>
        ) : needsDecision.length ? (
          <ul className="divide-y divide-line">
            {needsDecision.slice(0, 5).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{title.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{DECISION_STATES[title.status]}</p>
                </div>
                <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">Review →</Link>
              </li>
            ))}
            {needsDecision.length > 5 ? (
              <li className="px-4 py-3 text-xs text-muted">{needsDecision.length - 5} more items · <Link to="/workspace" className="font-semibold text-accent">Open title library</Link></li>
            ) : null}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted">No decisions are waiting for review.</p>
        )}
      </section>

      <section aria-labelledby="workspaces-heading" className="space-y-3">
        <div>
          <h3 id="workspaces-heading" className="font-semibold">Workspaces</h3>
          <p className="mt-0.5 text-xs text-muted">Each area opens its existing operational workspace. Permissions and approval gates remain unchanged.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Workspace title="Title Library" detail="Titles, Creator and Studio submissions, assets and metadata." to="/workspace" />
          <Workspace title="QC & Approvals" detail="Open the operational desk directly on its QC review queue." to="/admin/workstations?tab=QC" />
          <Workspace title="Rights & Licensing" detail="Open the operational desk directly on its rights review queue." to="/admin/workstations?tab=Rights" />
          <Workspace title="Buyer Management" detail="Verified Buyer profiles, organization grouping and Buyer dashboard access." to="/admin/buyers" />
          <Workspace title="Vendor Services" detail="Service catalogue, pricing, orders and fulfilment controls." to="/admin/services" />
          <Workspace title="People & Organizations" detail="Named Creator, Studio, Buyer, Investor and internal account registers." to="/admin/users" />
          <WorkspaceNotice title="Finance & Reconciliation" detail="Finance records and settlement workflows require a dedicated verified workspace. This area is not marked complete or release-certified." status="Implementation gate pending" />
          <Workspace title="Website CMS" detail="Public Bridge website copy and homepage media." to="/admin-cms" />
          <Workspace title="Audit & Security" detail="Persisted audit events and security review." to="/admin/audit" />
        </div>
      </section>

      <footer className="border-t border-line pt-4 text-xs text-muted">
        Bridge authorizes. Loop delivers. Buyer access remains title- and scope-specific.
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}


function WorkspaceNotice({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="flex min-h-32 flex-col justify-between rounded-xl border border-dashed border-line bg-surface p-4">
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
      </div>
      <span className="mt-4 text-xs font-medium text-muted">{status}</span>
    </div>
  );
}

function Workspace({ title, detail, to }: { title: string; detail: string; to: string }) {
  return (
    <Link to={to as any} className="group flex min-h-32 flex-col justify-between rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
      </div>
      <span className="mt-4 text-xs font-semibold text-accent">Open workspace →</span>
    </Link>
  );
}
