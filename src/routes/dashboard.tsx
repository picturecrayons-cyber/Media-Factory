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

const MODULE_GROUPS = [
  {
    eyebrow: "01 · Content operations",
    title: "Content & submissions",
    description: "Creator and Studio intake through title preparation, assets and technical review.",
    modules: [
      { title: "Submission & title intake", description: "Review incoming title records and open the canonical title workspace.", to: "/workspace", action: "Open intake" },
      { title: "QC & review workstations", description: "Technical QC, rights decisions, concept review and operational title queues.", to: "/admin/workstations", action: "Open reviews" },
      { title: "Production & services", description: "Service requests, production operations and vendor work.", to: "/admin/services", action: "Open services" },
      { title: "Delivery desk", description: "Delivery jobs, receipts, sign-off and title delivery records.", to: "/deliveries", action: "Open deliveries" },
    ],
  },
  {
    eyebrow: "02 · Commercial operations",
    title: "Rights, buyers & finance",
    description: "Keep rights authorization, buyer access and commercial records connected to the same title.",
    modules: [
      { title: "Rights & legal", description: "Rights evidence, agreements, territory and window review.", to: "/admin/workstations", action: "Open rights" },
      { title: "Buyer management", description: "Independent Buyer accounts, organizations and scoped title access.", to: "/buyer-management", action: "Manage buyers" },
      { title: "Licensing & deals", description: "Licensing pipeline, buyer negotiations and title-specific deal records.", to: "/buyer", action: "Open buyer desk" },
      { title: "Revenue & finance", description: "Payments, ledger, reconciliation and commercial administration.", to: "/admin", action: "Open finance" },
    ],
  },
  {
    eyebrow: "03 · Distribution & governance",
    title: "Publishing, people & control",
    description: "Separate Bridge authorization from Loop publication and preserve accountable access.",
    modules: [
      { title: "Loop publication gateway", description: "Review publication readiness and authorize only after Bridge gates clear.", to: "/cms", action: "Open Loop gateway" },
      { title: "People & access", description: "Creator, Studio, Buyer and internal roles with controlled access.", to: "/admin/users", action: "Manage access" },
      { title: "Website CMS", description: "Manage public Bridge website content.", to: "/admin-cms", action: "Open website CMS" },
      { title: "Audit & security", description: "Read-only persisted audit history and security evidence.", to: "/admin/audit", action: "Review audit" },
    ],
  },
] as const;

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

  if (session.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (session.isError) return <p role="alert" className="text-sm text-accent">Super Admin access required.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const needsDecision = titles.filter((title) => title.status in DECISION_STATES);
  const authorizedListings = titles.filter((title) => title.status === "LIVE_FOR_BUYERS").length;
  const commercialDeals = titles.filter((title) =>
    ["IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
  ).length;
  const failed = titlesQ.isError;
  const value = (count: number) => titlesQ.isPending || failed ? "—" : String(count);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <section className="relative overflow-hidden rounded-sm border border-line bg-surface p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-accent/10 to-transparent lg:block" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">StreamVista OPC Pvt Ltd · Super Admin</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Founder Centre</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              One command centre for content, rights, buyers, delivery and distribution. Open a workspace only when a decision or operation needs your attention.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/workspace" className="rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-[#041018]">Open title library</Link>
            <Link to="/admin/workstations" className="rounded-sm border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent">Open review desk</Link>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-muted">
          <span><strong className="text-fg">Bridge authorizes</strong> · rights and commercial control</span>
          <span><strong className="text-fg">Loop delivers</strong> · publication after authorization</span>
          <span>Buyer access stays title- and scope-specific</span>
        </div>
      </section>

      <section aria-label="Business overview" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Master titles" value={value(titles.length)} detail="Canonical Bridge records" />
        <Metric label="Pending decisions" value={value(needsDecision.length)} detail="QC · Rights · Licensing" />
        <Metric label="Buyer-authorized titles" value={value(authorizedListings)} detail="LIVE_FOR_BUYERS status" />
        <Metric label="Commercial deal states" value={value(commercialDeals)} detail="Negotiation · Licensed · Delivered" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <div className="overflow-hidden rounded-sm border border-line">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Decision queue</p>
              <h3 className="mt-1 font-display text-xl font-semibold">Needs your attention</h3>
              <p className="mt-1 text-xs text-muted">Only persisted title states requiring a review are shown.</p>
            </div>
            <span className="rounded-sm border border-line px-3 py-1.5 text-xs font-semibold tabular-nums">{titlesQ.isPending || failed ? "—" : needsDecision.length + " pending"}</span>
          </div>
          {titlesQ.isPending ? (
            <p className="px-4 py-7 text-sm text-muted">Loading decision queue…</p>
          ) : failed ? (
            <p role="alert" className="px-4 py-7 text-sm text-accent">Dashboard data unavailable. Refresh to retry; no zero values are assumed.</p>
          ) : needsDecision.length ? (
            <ul className="divide-y divide-line">
              {needsDecision.slice(0, 6).map((title) => (
                <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{title.name}</p>
                    <p className="mt-1 text-xs text-muted">{DECISION_STATES[title.status]}</p>
                  </div>
                  <Link to="/title/$id" params={{ id: title.id }} className="shrink-0 text-xs font-semibold text-accent hover:underline">Review title →</Link>
                </li>
              ))}
              {needsDecision.length > 6 ? <li className="px-4 py-3 text-xs text-muted">{needsDecision.length - 6} more decisions · <Link to="/workspace" className="font-semibold text-accent">View title library</Link></li> : null}
            </ul>
          ) : (
            <div className="px-4 py-7">
              <p className="text-sm font-medium">No QC, rights or licensing decisions are currently waiting.</p>
              <p className="mt-1 text-xs text-muted">This does not certify that every title is published or commercially ready.</p>
            </div>
          )}
        </div>

        <aside className="rounded-sm border border-line bg-elevated p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Fast access</p>
          <h3 className="mt-1 font-display text-xl font-semibold">Daily workspaces</h3>
          <div className="mt-4 divide-y divide-line">
            <QuickLink title="Submission & title review" description="Creator/Studio intake and title decisions" to="/admin/workstations" />
            <QuickLink title="Buyer management" description="Accounts and title access" to="/buyer-management" />
            <QuickLink title="Licensing & finance" description="Deals, payments and reconciliation" to="/admin" />
            <QuickLink title="Audit & security" description="Persisted operational evidence" to="/admin/audit" />
          </div>
        </aside>
      </section>

      <section aria-labelledby="workspace-groups" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Workspace directory</p>
            <h3 id="workspace-groups" className="mt-1 font-display text-2xl font-semibold">Business workspaces</h3>
          </div>
          <p className="max-w-md text-xs text-muted">Each module opens its dedicated, role-gated workspace. No operational action is performed from this overview.</p>
        </div>
        {MODULE_GROUPS.map((group) => (
          <section key={group.title} className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{group.eyebrow}</p>
                <h4 className="mt-1 text-lg font-semibold">{group.title}</h4>
              </div>
              <p className="max-w-xl text-xs text-muted">{group.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {group.modules.map((module) => (
                <Link key={module.title} to={module.to} className="group flex min-h-[150px] flex-col justify-between rounded-sm border border-line bg-surface p-4 transition-colors hover:border-accent hover:bg-elevated">
                  <div>
                    <h5 className="text-sm font-semibold">{module.title}</h5>
                    <p className="mt-2 text-xs leading-relaxed text-muted">{module.description}</p>
                  </div>
                  <span className="mt-4 text-xs font-semibold text-accent">{module.action} <span aria-hidden="true">→</span></span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <span>Prepare. Protect. License. Deliver.</span>
        <Link to="/admin/workstations" className="font-semibold text-accent hover:underline">Open operations →</Link>
      </footer>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-sm border border-line bg-surface px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{detail}</p>
    </article>
  );
}

function QuickLink({ title, description, to }: { title: string; description: string; to: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 py-3 hover:text-accent">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-[11px] text-muted">{description}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-accent">→</span>
    </Link>
  );
}
