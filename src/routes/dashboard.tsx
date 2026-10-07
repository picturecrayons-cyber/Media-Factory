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

function DashboardBody() {
  const dashboardQ = useQuery({ queryKey: ["bridge-dashboard-session"], queryFn: () => getDashboardSession(), retry: false });
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), enabled: dashboardQ.isSuccess });
  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Super admin access required.</p>;
  const titles = titlesQ.data?.titles ?? [];
  const live = titles.filter((t) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status));
  const pipeline = titles.filter((t) => t.status === "LICENSING_READY").length;
  const deals = titles.filter((t) => t.status === "LICENSED" || t.status === "IN_NEGOTIATION").length;
  const revenue = live.reduce((sum, t) => sum + (t.status === "LICENSED" || t.status === "DELIVERED" ? t.licensingFeePaise : 0), 0);
  const needsAction = titles.filter((t) => ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(t.status)).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Revenue</h2>
          <p className="mt-1 text-sm text-muted">₹{(revenue / 100).toLocaleString("en-IN")} licensed. {needsAction} titles need a decision.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/workspace" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">Titles</Link>
          <Link to="/buyer" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Buyer desk</Link>
          <Link to="/deliveries" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Deliveries</Link>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BRIDGE_LOOP_LANES.map((lane) => (
          <div key={lane.id} className="rounded-sm border border-line px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-muted">{lane.label}</p>
            <p className="mt-1 text-2xl font-semibold">{titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length}</p>
            <p className="text-xs text-muted">Set here. Public on Loop only after TVOD delivery.</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Licensed value" value={`₹${(revenue / 100).toLocaleString("en-IN")}`} />
        <Stat label="Live for buyers" value={String(live.length)} />
        <Stat label="Ready to list" value={String(pipeline)} />
        <Stat label="Active deals" value={String(deals)} />
      </div>
      <ul className="divide-y divide-line rounded-sm border border-line">
        {titles.slice(0, 8).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{t.name}</span>
            <span className="text-muted">{t.status.replaceAll("_", " ").toLowerCase()}</span>
          </li>
        ))}
        {!titles.length && <li className="px-4 py-6 text-sm text-muted">No titles yet.</li>}
      </ul>
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
