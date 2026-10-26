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
        <BridgeShell actor={actor} title="Ops">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

const ADMIN_MODULES = [
  { title: "Library", to: "/gallery" },
  { title: "Operations", to: "/admin/workstations" },
  { title: "Buyers", to: "/buyer" },
  { title: "Deliveries", to: "/deliveries" },
  { title: "People", to: "/internal" },
  { title: "Site", to: "/cms" },
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
  const reportingUnavailable = titlesQ.isError;
  const metricValue = (value: number) => titlesQ.isPending || reportingUnavailable ? "—" : String(value);
  const moneyValue = titlesQ.isPending || reportingUnavailable ? "—" : `₹${(revenue / 100).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BRIDGE_LOOP_LANES.map((lane) => (
          <article key={lane.id} className="rounded-2xl border border-line px-4 py-3">
            <p className="text-xs text-muted">{lane.label}</p>
            <p className="mt-1 text-2xl font-semibold">
              {titlesQ.isPending || reportingUnavailable ? "—" : titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length}
            </p>
          </article>
        ))}
      </section>

      <section aria-label="Revenue metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Licensed" value={moneyValue} />
        <Stat label="Live" value={metricValue(live.length)} />
        <Stat label="Ready" value={metricValue(pipeline)} />
        <Stat label="Deals" value={metricValue(deals)} />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ADMIN_MODULES.map((module) => (
          <Link key={module.title} to={module.to} className="rounded-2xl border border-line bg-surface px-4 py-5 text-sm font-semibold">
            {module.title}
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Titles</h2>
        {titlesQ.isPending ? <p className="text-sm text-muted">Loading…</p> : reportingUnavailable ? (
          <p role="alert" className="text-sm text-red-500">Could not load titles.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {titles.slice(0, 12).map((title) => (
              <li key={title.id}>
                <Link to="/title/$id" params={{ id: title.id }} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0 truncate font-medium">{title.name}</span>
                  <span className="shrink-0 text-xs text-muted">{title.status.replaceAll("_", " ").toLowerCase()}</span>
                </Link>
              </li>
            ))}
            {!titles.length ? <li className="px-4 py-6 text-sm text-muted">No titles.</li> : null}
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
