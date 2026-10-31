import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import { getDashboardSession } from "@/lib/bridge/session";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

const INTERNAL_TEST_TITLE_ID = "bridge-oci-e2e-7be3ab166df28709";

function Dashboard() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Admin dashboard">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

const ADMIN_MODULES = [
  {
    title: "Titles & media",
    description: "Find a title, manage its files, and review QC and rights status.",
    to: "/workspace",
    action: "Open titles",
  },
  {
    title: "Operations & approvals",
    description: "Review readiness and role-gated operational tasks.",
    to: "/admin/workstations",
    action: "Open operations",
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
    description: "Manage internal-user invitations and profiles.",
    to: "/internal",
    action: "Open user access",
  },
  {
    title: "CMS & site content",
    description: "Edit Bridge-managed site content.",
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

  const allTitles = titlesQ.data?.titles ?? [];
  const testFixture = allTitles.find((title) => title.id === INTERNAL_TEST_TITLE_ID);
  // Keep the known internal E2E fixture visible for testing, but out of catalogue and commercial metrics.
  const titles = allTitles.filter((title) => title.id !== INTERNAL_TEST_TITLE_ID);
  const live = titles.filter((title) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status));
  const pipeline = titles.filter((title) => title.status === "LICENSING_READY").length;
  const deals = titles.filter((title) => title.status === "LICENSED" || title.status === "IN_NEGOTIATION").length;
  const revenue = live.reduce((sum, title) => sum + (title.status === "LICENSED" || title.status === "DELIVERED" ? title.licensingFeePaise : 0), 0);
  const needsAction = titles.filter((title) => ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(title.status)).length;
  const reportingUnavailable = titlesQ.isError;
  const metricValue = (value: number) => titlesQ.isPending || reportingUnavailable ? "—" : String(value);
  const moneyValue = titlesQ.isPending || reportingUnavailable ? "—" : `₹${(revenue / 100).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Crayons Bridge · Super Admin</p>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Good to see you. What needs doing?</h2>
          <p className="mt-2 text-sm text-muted">
            {titlesQ.isPending
              ? "Loading title reporting…"
              : reportingUnavailable
                ? "Reporting is unavailable. Metrics are withheld rather than shown as zero."
                : `${moneyValue} licensed value · ${needsAction} titles need a decision.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/workspace" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#041018]">Browse titles</Link>
          <Link to="/admin/workstations" className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold">Review operations</Link>
        </div>
      </section>

      <section aria-labelledby="test-workspace-title" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Testing · internal only</p>
            <h3 id="test-workspace-title" className="mt-1 font-display text-xl font-semibold">Upload test workspace</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Use this dedicated fixture to inspect upload and verification UI. It is excluded from catalogue and commercial metrics.
              Do not submit it for QC or publish it. A visible test record does not prove Preview is isolated from Production.
            </p>
            <p className="mt-3 text-sm">
              <span className="font-medium">Status: </span>
              {titlesQ.isPending ? "Checking…" : reportingUnavailable ? "Unavailable" : testFixture ? testFixture.status.replaceAll("_", " ") : "Fixture not found"}
            </p>
          </div>
          {testFixture ? (
            <Link
              to="/title/$id"
              params={{ id: testFixture.id }}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-fg/5"
            >
              Open upload test →
            </Link>
          ) : (
            <Link to="/workspace" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-fg/5">
              Check title library →
            </Link>
          )}
        </div>
      </section>

      <section aria-label="Catalogue overview" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BRIDGE_LOOP_LANES.map((lane) => (
          <article key={lane.id} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">{lane.label}</p>
            <p className="mt-1 text-2xl font-semibold">
              {titlesQ.isPending || reportingUnavailable
                ? "—"
                : titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Catalogue titles. Buyer visibility still depends on server-side publication gates.</p>
          </article>
        ))}
      </section>

      <section aria-label="Commercial overview" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Licensed value" value={moneyValue} />
        <Stat label="Live / commercial titles" value={metricValue(live.length)} />
        <Stat label="Ready to list" value={metricValue(pipeline)} />
        <Stat label="Active deals" value={metricValue(deals)} />
      </section>

      <section aria-labelledby="admin-modules-title" className="space-y-3">
        <div>
          <h3 id="admin-modules-title" className="font-display text-xl font-semibold">Workspaces</h3>
          <p className="mt-1 text-sm text-muted">Choose one task area. Each workspace keeps its existing role and workflow checks.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ADMIN_MODULES.map((module) => (
            <article key={module.title} className="flex flex-col items-start rounded-xl border border-line bg-surface p-4">
              <h4 className="font-semibold">{module.title}</h4>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{module.description}</p>
              <Link to={module.to} className="mt-4 text-sm font-semibold text-accent hover:underline">
                {module.action} →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="title-queue-title" className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
          <div>
            <h3 id="title-queue-title" className="font-semibold">Recent catalogue titles</h3>
            <p className="mt-1 text-xs text-muted">Internal test fixtures are shown separately above.</p>
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
            {titles.slice(0, 6).map((title) => (
              <li key={title.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{title.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {title.contentType ? `${title.contentType} · ` : ""}{title.language}{title.year ? ` · ${title.year}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-muted">{title.status.replaceAll("_", " ").toLowerCase()}</span>
              </li>
            ))}
            {!titles.length && <li className="px-4 py-6 text-sm text-muted">No catalogue titles were returned by the canonical query.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
