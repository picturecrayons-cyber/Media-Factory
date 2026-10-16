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
        <BridgeShell actor={actor} title="Command Centre">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
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
  });

  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (dashboardQ.isError)
    return <p role="alert" className="text-sm text-accent">Super admin access required.</p>;
  if (titlesQ.isError)
    return <p role="alert" className="text-sm text-accent">Title data could not be loaded. Refresh or check workspace access.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const decisionStatuses = ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"];
  const needsDecision = titles.filter((title) => decisionStatuses.includes(title.status));
  const buyerReady = titles.filter((title) => title.status === "LICENSING_READY").length;
  const activeDeals = titles.filter((title) => ["LICENSED", "IN_NEGOTIATION"].includes(title.status)).length;
  const buyerVisible = titles.filter((title) =>
    ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
  ).length;
  const recordedLicensingValuePaise = titles.reduce(
    (sum, title) =>
      ["LICENSED", "DELIVERED"].includes(title.status)
        ? sum + (title.licensingFeePaise || 0)
        : sum,
    0,
  );

  const areas = [
    {
      title: "Content & Ingest",
      description: "Titles, masters, artwork, subtitles and ingest status.",
      to: "/workspace" as const,
      action: "Open titles",
    },
    {
      title: "Rights & QC",
      description: "Review rights evidence, QC findings and approval readiness.",
      to: "/admin/workstations" as const,
      action: "Open review desk",
    },
    {
      title: "Buyers & Licensing",
      description: "Buyer pipeline, licensing-ready titles and active negotiations.",
      to: "/buyer" as const,
      action: "Open buyer desk",
    },
    {
      title: "Deliveries",
      description: "Track delivery jobs and resolve operational failures.",
      to: "/deliveries" as const,
      action: "Open deliveries",
    },
    {
      title: "Admin & RBAC",
      description: "Manage workspace controls, user access and publication readiness.",
      to: "/admin" as const,
      action: "Open admin",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Bridge authorizes · Loop delivers</p>
            <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Decisions first. One clear workflow.</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Start with titles that need review, then move only approved rights and QC packages into licensing and authorized delivery.
            </p>
          </div>
          <Link to="/workspace" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-[#041018]">
            Open content workspace
          </Link>
        </div>
      </section>

      <section aria-label="Workflow summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total titles" value={String(titles.length)} detail="Records visible to this super-admin session" />
        <Stat label="Needs a decision" value={String(needsDecision.length)} detail="QC, rights or licensing review queue" />
        <Stat label="Buyer-ready" value={String(buyerReady)} detail="Licensing-ready status; not a rights grant by itself" />
        <Stat label="Active deals" value={String(activeDeals)} detail="Licensed or in negotiation" />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Work areas</h3>
          <p className="mt-1 text-sm text-muted">Choose a work area; permissions are enforced by each route and server action.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {areas.map((area) => (
            <article key={area.title} className="flex min-h-44 flex-col rounded-2xl border border-line bg-surface p-5">
              <h4 className="text-base font-semibold">{area.title}</h4>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted">{area.description}</p>
              <Link to={area.to} className="mt-4 inline-flex w-fit items-center rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-elevated">
                {area.action} <span aria-hidden="true" className="ml-2">→</span>
              </Link>
            </article>
          ))}
          <article className="flex min-h-44 flex-col rounded-2xl border border-dashed border-line p-5">
            <h4 className="text-base font-semibold">Finance & Reports</h4>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted">
              Payment settlement, refunds, fees, invoices and operating costs must be reconciled before cash revenue can be certified.
            </p>
            <p className="mt-4 text-xs font-semibold text-muted">Reconciliation gate · not certified</p>
          </article>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-line bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
            <div>
              <h3 className="text-lg font-semibold">Needs your decision</h3>
              <p className="mt-1 text-sm text-muted">The highest-priority review statuses currently visible.</p>
            </div>
            <Link to="/admin/workstations" className="text-sm font-semibold text-accent">Review queue →</Link>
          </div>
          <ul className="divide-y divide-line">
            {needsDecision.slice(0, 6).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{title.name}</p>
                  <p className="mt-1 text-xs text-muted">{title.status.replaceAll("_", " ").toLowerCase()}</p>
                </div>
                <Link to="/workspace" className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                  Open titles
                </Link>
              </li>
            ))}
            {!needsDecision.length && (
              <li className="px-5 py-7 text-sm text-muted">No titles are currently marked for QC, rights or licensing decision.</li>
            )}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-lg font-semibold">Loop readiness</h3>
            <p className="mt-1 text-sm text-muted">Content type distribution is descriptive only. Publication still requires an active Bridge authorization.</p>
            <div className="mt-4 space-y-3">
              {BRIDGE_LOOP_LANES.map((lane) => {
                const count = titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length;
                return (
                  <div key={lane.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{lane.label}</span>
                    <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-lg font-semibold">Recorded licensing value</h3>
            <p className="mt-2 font-display text-2xl font-semibold">₹{(recordedLicensingValuePaise / 100).toLocaleString("en-IN")}</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sum of title licensing-fee metadata for licensed/delivered titles. This is not collected cash, settlement, or reconciled net revenue.
            </p>
            <p className="mt-3 text-xs font-semibold text-muted">{buyerVisible} buyer-visible or later-stage title records</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}
