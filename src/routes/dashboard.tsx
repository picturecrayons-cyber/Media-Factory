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

const PRIMARY_WORKSPACES = [
  {
    title: "Titles & Media",
    description: "Title records, metadata, artwork, uploads and rights.",
    to: "/workspace",
  },
  {
    title: "Operations & Approvals",
    description: "QC, legal review and internal approval queues.",
    to: "/admin/workstations",
  },
  {
    title: "Buyer Desk",
    description: "Buyer access, licensing activity and offers.",
    to: "/buyer",
  },
] as const;

const MORE_WORKSPACES = [
  { title: "Deliveries & Services", description: "Delivery work and service requests.", to: "/deliveries" },
  { title: "People & Access", description: "Internal users, invitations and access profiles.", to: "/internal" },
  { title: "CMS & Site Content", description: "Bridge-managed website content.", to: "/cms" },
] as const;

const ACTION_STATUSES: Record<string, string> = {
  QC_REVIEW: "QC review",
  RIGHTS_REVIEW: "Rights review",
  LICENSING_READY: "Licensing decision",
};

const COMMERCIAL_STATUSES = ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"];

function formatUpdatedAt(value: string): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

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

  if (dashboardQ.isPending) {
    return <p className="px-1 py-4 text-sm text-muted">Checking access…</p>;
  }
  if (dashboardQ.isError) {
    return <p role="alert" className="px-1 py-4 text-sm text-accent">Super admin access required.</p>;
  }

  const titles = titlesQ.data?.titles ?? [];
  const reportingUnavailable = titlesQ.isError || titlesQ.isPending;
  const actionCount = titles.filter((title) => title.status in ACTION_STATUSES).length;
  const commercialCount = titles.filter((title) => COMMERCIAL_STATUSES.includes(title.status)).length;
  const licensingReadyCount = titles.filter((title) => title.status === "LICENSING_READY").length;
  const licensedValuePaise = titles.reduce(
    (sum, title) =>
      title.status === "LICENSED" || title.status === "DELIVERED"
        ? sum + title.licensingFeePaise
        : sum,
    0,
  );
  const metric = (value: number) => (reportingUnavailable ? "—" : String(value));
  const licensedValue = reportingUnavailable
    ? "—"
    : `₹${(licensedValuePaise / 100).toLocaleString("en-IN")}`;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-1 pb-10 sm:px-2">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          StreamVista OPC Pvt Ltd
        </p>
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Founder Control Centre
        </h2>
        <p className="text-sm text-muted">A clear view of the business and its workspaces.</p>
      </header>

      <section aria-labelledby="business-snapshot" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="business-snapshot" className="font-display text-lg font-semibold">
            Business Snapshot
          </h3>
          <span className="text-xs text-muted">Live title records</span>
        </div>

        {titlesQ.isError ? (
          <p role="alert" className="text-sm text-accent">
            Business figures are unavailable. Refresh to retry; no zero values are assumed.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 border-y border-line py-4">
              <SnapshotMetric label="Titles" value={metric(titles.length)} />
              <SnapshotMetric label="Needs attention" value={metric(actionCount)} />
              <SnapshotMetric label="Live / commercial" value={metric(commercialCount)} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
              <span>Licensing-ready: <strong className="font-semibold text-foreground">{metric(licensingReadyCount)}</strong></span>
              <span>Recorded licensed value*: <strong className="font-semibold text-foreground">{licensedValue}</strong></span>
            </div>
            <p className="text-[11px] text-muted">
              *Recorded fees for licensed or delivered titles; not cash received or an accounting balance.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="workspaces-heading" className="space-y-3">
        <div>
          <h3 id="workspaces-heading" className="font-display text-lg font-semibold">Workspaces</h3>
          <p className="mt-1 text-sm text-muted">Go directly to the work you need to do.</p>
        </div>
        <nav aria-label="Primary workspaces" className="divide-y divide-line border-y border-line">
          {PRIMARY_WORKSPACES.map((workspace) => (
            <Link
              key={workspace.title}
              to={workspace.to}
              className="group flex flex-col gap-2 py-4 transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{workspace.title}</span>
                <span className="mt-1 block text-sm text-muted">{workspace.description}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-accent">
                Open workspace <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </nav>

        <details className="group pt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
            More workspaces
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <nav aria-label="Additional workspaces" className="mt-3 grid gap-x-6 sm:grid-cols-3">
            {MORE_WORKSPACES.map((workspace) => (
              <Link
                key={workspace.title}
                to={workspace.to}
                className="border-t border-line py-3 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="block text-sm font-semibold">{workspace.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{workspace.description}</span>
                <span className="mt-2 block text-xs font-semibold text-accent">Open workspace →</span>
              </Link>
            ))}
          </nav>
        </details>
      </section>

      <section aria-labelledby="recent-titles-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h3 id="recent-titles-heading" className="font-display text-lg font-semibold">
              Recently updated titles
            </h3>
            <p className="mt-1 text-sm text-muted">The latest title records, newest first.</p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">
            View all titles →
          </Link>
        </div>

        {titlesQ.isPending ? (
          <p className="border-y border-line py-5 text-sm text-muted">Loading title records…</p>
        ) : titlesQ.isError ? (
          <p role="alert" className="border-y border-line py-5 text-sm text-accent">
            Recent titles are unavailable. Refresh to retry.
          </p>
        ) : titles.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {titles.slice(0, 6).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{title.name}</span>
                  <span className="mt-1 block text-xs text-muted">
                    Updated {formatUpdatedAt(title.updatedAt)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {title.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-y border-line py-5 text-sm text-muted">
            No title records were returned by the canonical query.
          </p>
        )}
      </section>
    </main>
  );
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs leading-snug text-muted">{label}</p>
    </div>
  );
}
