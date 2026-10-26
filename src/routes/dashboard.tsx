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
    title: "Library",
    description: "Browse stored titles. Open one to view the file.",
    to: "/gallery",
    action: "Open library",
  },
  {
    title: "Operations & approvals",
    description: "Review title readiness and use the role-gated operational workstations.",
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

      <section aria-labelledby="title-queue-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Catalogue</p>
            <h3 id="title-queue-title" className="mt-1 font-display text-2xl font-semibold">Title gallery</h3>
            <p className="mt-1 text-sm text-muted">Canonical title records · IDs and workflow status at a glance.</p>
          </div>
          <Link to="/workspace" className="inline-flex items-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold transition hover:bg-fg/5">View all titles <span aria-hidden="true" className="ml-2">↗</span></Link>
        </div>
        {titlesQ.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading title gallery">
            {[0, 1, 2, 3].map((n) => <div key={n} className="h-36 animate-pulse rounded-xl border border-line bg-surface" />)}
          </div>
        ) : reportingUnavailable ? (
          <div className="rounded-xl border border-line bg-surface p-5">
            <p role="alert" className="text-sm text-accent">The title gallery could not be loaded. Refresh to retry; metrics above are withheld.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {titles.slice(0, 8).map((title) => (
              <article key={title.id} className="group flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated text-sm font-bold text-accent" aria-hidden="true">
                    {(title.name.trim()[0] || "T").toUpperCase()}
                  </div>
                  <span className="rounded-full border border-line bg-elevated px-2.5 py-1 text-[11px] font-semibold capitalize text-muted">{title.status.replaceAll("_", " ").toLowerCase()}</span>
                </div>
                <h4 className="mt-4 line-clamp-2 min-h-10 font-semibold leading-snug">{title.name}</h4>
                <p className="mt-1 text-xs text-muted">{title.contentType || "Title"}{title.language ? ` · ${title.language}` : ""}{title.year ? ` · ${title.year}` : ""}</p>
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Title ID</p>
                  <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-muted">{title.id}</p>
                </div>
                <Link to="/title/$id" params={{ id: title.id }} className="mt-4 inline-flex items-center justify-between rounded-lg bg-fg/5 px-3 py-2.5 text-sm font-semibold transition group-hover:bg-accent/10">
                  Open title <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
            {!titles.length && <div className="rounded-xl border border-dashed border-line p-6 text-sm text-muted sm:col-span-2 xl:col-span-4">No title records were returned by the canonical query.</div>}
          </div>
        )}
        <p className="text-xs text-muted">Artwork and buyer visibility are not inferred from title metadata. Publication remains controlled by the server-side authorization gates.</p>
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
