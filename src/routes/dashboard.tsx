import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import { getDashboardSession } from "@/lib/bridge/session";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

const ACTION_STATUSES = ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"];

function normalizeTitleName(name: string) {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function Dashboard() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Dashboard">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function DashboardBody() {
  const dashboardQ = useQuery({ queryKey: ["bridge-dashboard-session"], queryFn: () => getDashboardSession(), retry: false });
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), enabled: dashboardQ.isSuccess });

  const titles = titlesQ.data?.titles ?? [];
  const summary = useMemo(() => {
    const groups = new Map<string, typeof titles>();
    for (const title of titles) {
      const key = normalizeTitleName(title.name);
      const current = groups.get(key) ?? [];
      current.push(title);
      groups.set(key, current);
    }
    const duplicateGroups = Array.from(groups.values())
      .filter((records) => records.length > 1)
      .sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name));
    const needsAction = titles
      .filter((title) => ACTION_STATUSES.includes(title.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const live = titles.filter((title) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status));
    const deals = titles.filter((title) => title.status === "LICENSED" || title.status === "IN_NEGOTIATION");
    const revenue = live.reduce((sum, title) => sum + (title.status === "LICENSED" || title.status === "DELIVERED" ? title.licensingFeePaise : 0), 0);
    const catalog = BRIDGE_LOOP_LANES.map((lane) => ({
      label: lane.label,
      count: titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length,
    }));
    return { duplicateGroups, needsAction, live, deals, revenue, catalog };
  }, [titles]);

  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Super admin access required.</p>;
  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading dashboard data…</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Overview</h2>
          <p className="mt-1 text-sm text-muted">Your titles, decisions, and licensing at a glance.</p>
        </div>
        <Link to="/workspace" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">Open title library</Link>
      </header>

      {titlesQ.isError ? (
        <p role="alert" className="rounded-sm border border-line px-4 py-3 text-sm text-accent">
          Could not load title data. Refresh to try again.
        </p>
      ) : null}

      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Licensed value" value={`₹${(summary.revenue / 100).toLocaleString("en-IN")}`} />
        <Stat label="Needs a decision" value={String(summary.needsAction.length)} />
        <Stat label="Live for buyers" value={String(summary.live.length)} />
        <Stat label="Active deals" value={String(summary.deals.length)} />
      </section>

      <p className="text-xs text-muted">
        Catalog: {summary.catalog.map((item) => `${item.label} ${item.count}`).join(" · ")}
      </p>

      <section className="rounded-sm border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 className="font-semibold">Possible duplicate titles</h3>
            <p className="mt-1 text-xs text-muted">Grouped for review only. No records have been merged or deleted.</p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent">Review</Link>
        </div>
        {summary.duplicateGroups.length ? (
          <ul className="divide-y divide-line">
            {summary.duplicateGroups.slice(0, 5).map((records) => (
              <li key={records.map((record) => record.id).sort().join(":")} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{records[0].name}</p>
                  <p className="mt-1 text-xs text-muted">{records.length} records · {Array.from(new Set(records.map((record) => record.status.replaceAll("_", " ").toLowerCase()))).join(" / ")}</p>
                </div>
                <span className="shrink-0 rounded-sm border border-line px-2 py-1 text-xs text-muted">Check records</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted">No same-name title groups found.</p>
        )}
      </section>

      <section className="rounded-sm border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 className="font-semibold">Work queue</h3>
            <p className="mt-1 text-xs text-muted">Only titles awaiting QC, rights review, or listing readiness.</p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent">All titles</Link>
        </div>
        {summary.needsAction.length ? (
          <ul className="divide-y divide-line">
            {summary.needsAction.slice(0, 6).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{title.name}</span>
                <span className="text-xs text-muted">{title.status.replaceAll("_", " ").toLowerCase()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted">No titles need a decision right now.</p>
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
