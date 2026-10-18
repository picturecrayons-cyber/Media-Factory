import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { BRIDGE_LOOP_LANES, isActiveLoopPublication, loopStageType } from "@/lib/bridge/loop-lanes";
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
  const publicationQ = useQuery({ queryKey: ["bridge-loop-publication-readiness"], queryFn: () => listLoopPublicationReadiness(), enabled: dashboardQ.isSuccess });
  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Super admin access required.</p>;
  if (titlesQ.isPending || publicationQ.isPending) return <p className="text-sm text-muted">Loading verified Bridge and Loop reporting…</p>;
  if (titlesQ.isError || publicationQ.isError) return <p role="alert" className="text-sm text-accent">Revenue reporting is unavailable. Refresh to retry; no data has been changed.</p>;
  const titles = titlesQ.data?.titles ?? [];
  const readiness = publicationQ.data?.titles ?? [];
  const now = new Date();
  const publishedOnLoop = readiness.filter((t) => t.publication && isActiveLoopPublication({
    authorizationStatus: t.publication.authorizationStatus,
    listed: t.publication.listed,
    published: t.publication.published,
    windowStart: t.publication.windowStart,
    windowEnd: t.publication.windowEnd,
  }, now));
  const live = publishedOnLoop.filter((t) => t.bridgeStatus === "LIVE_FOR_BUYERS");
  const pipeline = readiness.filter((t) => t.ready).length;
  const deals = titles.filter((t) => t.status === "LICENSED" || t.status === "IN_NEGOTIATION").length;
  const revenue = titles.reduce((sum, t) => sum + (t.status === "LICENSED" || t.status === "DELIVERED" ? t.licensingFeePaise : 0), 0);
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
            <p className="text-xs uppercase tracking-widest text-muted">{lane.label} on Loop</p>
            <p className="mt-1 text-2xl font-semibold">{publishedOnLoop.filter((title) => loopStageType(title.contentType) === lane.loopType).length}</p>
            <p className="text-xs text-muted">Active authorized publication with a valid delivery window.</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Licensed value" value={`₹${(revenue / 100).toLocaleString("en-IN")}`} />
        <Stat label="Live for buyers" value={String(live.length)} />
        <Stat label="Bridge inventory" value={String(titles.length)} />
        <Stat label="Ready to list" value={String(pipeline)} />
        <Stat label="Active deals" value={String(deals)} />
      </div>
      <ul className="divide-y divide-line rounded-sm border border-line">
        {titles.slice(0, 8).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <span className="font-medium">{t.name}</span>
              <p className="break-all font-mono text-[10px] text-muted">ID: {t.id}</p>
              <p className="text-xs text-muted">Owner: {t.ownerAccountType === "independent_creator" ? "Creator" : t.ownerAccountType === "studio" ? "Studio" : t.ownerAccountType} · {t.ownerUserId}</p>
            </div>
            <span className="shrink-0 text-muted">{t.status.replaceAll("_", " ").toLowerCase()}</span>
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
