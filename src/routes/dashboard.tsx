import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import { getDashboardSession } from "@/lib/bridge/session";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Revenue desk">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

const ADMIN_MODULES = [
  {
    title: "Titles & media",
    description: "Canonical title records, metadata, artwork, uploads, QC and rights workflow.",
    to: "/workspace",
    action: "Open title workspace",
  },
  {
    title: "Operations & approvals",
    description: "Review title readiness and use the role-gated operational workstations.",
    to: "/admin/workstations",
    action: "Open operations",
  },
  {
    title: "Buyer CRM & invitations",
    description: "Manage organization-owned buyer contacts, pipeline stages and invitations.",
    to: "/buyer-crm",
    action: "Open Buyer CRM",
  },
  {
    title: "Buyer desk & licensing",
    description: "Review buyer activity and licensing/payment workflow states.",
    to: "/buyer",
    action: "Open buyer desk",
  },
  {
    title: "Deliveries & services",
    description: "Track delivery work and operational service requests.",
    to: "/deliveries",
    action: "Open deliveries",
  },
  {
    title: "People & access",
    description: "Manage the existing internal-user invitation and profile workflow.",
    to: "/internal",
    action: "Open user access",
  },
  {
    title: "CMS & site content",
    description: "Edit the existing Bridge-managed site content workspace.",
    to: "/cms",
    action: "Open CMS",
  },
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
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Super admin access required.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const live = titles.filter((t) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status));
  const pipeline = titles.filter((t) => t.status === "LICENSING_READY").length;
  const deals = titles.filter((t) => t.status === "LICENSED" || t.status === "IN_NEGOTIATION").length;
  const revenue = live.reduce((sum, t) => sum + (t.status === "LICENSED" || t.status === "DELIVERED" ? t.licensingFeePaise : 0), 0);
  const needsAction = titles.filter((t) => ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(t.status)).length;
  const reportingUnavailable = titlesQ.isError;
  const metricValue = (value: number) => titlesQ.isPending || reportingUnavailable ? "—" : String(value);
  const moneyValue = titlesQ.isPending || reportingUnavailable ? "—" : `₹${(revenue / 100).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Crayons Bridge · Super Admin</p>
          <h2 className="font-display text-3xl font-semibold">Revenue & operations</h2>
          <p className="mt-1 text-sm text-muted">
            {titlesQ.isPending
              ? "Loading verified title reporting…"
              : reportingUnavailable
                ? "Reporting is unavailable. Metrics are withheld rather than shown as zero."
                : `${moneyValue} licensed value · ${needsAction} titles need a decision.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/workspace" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">Titles</Link>
          <Link to="/buyer" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Buyer desk</Link>
          <Link to="/deliveries" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Deliveries</Link>
        </div>
      </section>

      <section aria-label="Title lanes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BRIDGE_LOOP_LANES.map((lane) => (
          <article key={lane.id} className="rounded-sm border border-line px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-muted">{lane.label}</p>
            <p className="mt-1 text-2xl font-semibold">
              {titlesQ.isPending || reportingUnavailable
                ? "—"
                : titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length}
            </p>
            <p className="text-xs text-muted">Titles in this content lane. Buyer visibility still depends on server-side publication gates.</p>
          </article>
        ))}
      </section>

      <section aria-label="Revenue metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Licensed value" value={moneyValue} />
        <Stat label="Live / commercial titles" value={metricValue(live.length)} />
        <Stat label="Ready to list" value={metricValue(pipeline)} />
        <Stat label="Active deals" value={metricValue(deals)} />
      </section>

      <section aria-labelledby="admin-modules-title" className="space-y-3">
        <div>
          <h3 id="admin-modules-title" className="font-display text-2xl font-semibold">Admin modules</h3>
          <p className="mt-1 text-sm text-muted">Open the existing role-gated workspaces from one place. A link does not imply a workflow has passed its release or authorization gates.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ADMIN_MODULES.map((module) => (
            <article key={module.title} className="flex flex-col items-start rounded-sm border border-line p-4">
              <h4 className="font-semibold">{module.title}</h4>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{module.description}</p>
              <Link to={module.to} className="mt-4 text-sm font-semibold text-accent hover:underline">
                {module.action} →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="title-queue-title" className="rounded-sm border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 id="title-queue-title" className="font-semibold">Recent title records</h3>
            <p className="text-xs text-muted">Canonical records only; no synthetic or fallback counts.</p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">View all titles →</Link>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-6 text-sm text-muted">Loading title records…</p>
        ) : reportingUnavailable ? (
          <div className="px-4 py-6">
            <p role="alert" className="text-sm text-accent">The title queue could not be loaded. Refresh to retry; metrics above are withheld.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {titles.slice(0, 8).map((title) => (
              <li key={title.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{title.name}</span>
                  <p className="break-all font-mono text-[10px] text-muted">ID: {title.id}</p>
                </div>
                <span className="shrink-0 text-muted">{title.status.replaceAll("_", " ").toLowerCase()}</span>
              </li>
            ))}
            {!titles.length && <li className="px-4 py-6 text-sm text-muted">No title records were returned by the canonical query.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
