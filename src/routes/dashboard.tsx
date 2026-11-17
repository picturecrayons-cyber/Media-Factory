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

const WORK_AREAS = [
  {
    group: "Content & QC",
    summary: "Title intake, metadata, artwork, uploads and technical review.",
    links: [{ label: "Title workspace", to: "/workspace" }, { label: "Operations & QC", to: "/admin/workstations" }],
    state: "available",
  },
  {
    group: "Rights & Licensing",
    summary: "Rights review, licensing readiness, buyer publication gates and audit trail.",
    links: [{ label: "Rights & approval workstations", to: "/admin/workstations" }, { label: "Bridge CMS", to: "/cms" }],
    state: "available",
  },
  {
    group: "Buyers & Deals",
    summary: "Buyer catalogue inspection and licensing workflow. Super Admin inspection remains read-only.",
    links: [{ label: "Buyer workspace", to: "/buyer" }],
    state: "preview-gated",
  },
  {
    group: "Delivery & Vendors",
    summary: "Vendor requests, assignment, receipt validation and delivery sign-off.",
    links: [{ label: "Delivery workspace", to: "/deliveries" }],
    state: "available",
  },
  {
    group: "Loop CMS & Publishing",
    summary: "Bridge-side publication readiness and authorization. Consumer merchandising CMS is a separate implementation gap.",
    links: [{ label: "Loop CMS governance", to: "/loop-cms" }, { label: "Bridge publication gateway", to: "/cms" }],
    state: "partial",
  },
  {
    group: "People, RBAC & Invitations",
    summary: "Internal roles, access review and currently supported internal invitations.",
    links: [{ label: "People & operations", to: "/internal" }, { label: "Account identity", to: "/account" }],
    state: "partial",
  },
  {
    group: "Finance & Payments",
    summary: "Read-only payment record oversight is available for Preview review. Settlement, invoice and ledger reconciliation remain separate; Buyer checkout and customer entitlements stay isolated.",
    links: [{ label: "Payment oversight", to: "/finance" }],
    state: "preview-gated",
  },
  {
    group: "Storage & Assets",
    summary: "Asset metadata and title-linked workflows remain in their canonical workspaces; destructive storage controls are not added here.",
    links: [{ label: "Title & asset workspace", to: "/workspace" }],
    state: "partial",
  },
  {
    group: "Support & Communications",
    summary: "Support queue and customer communication governance require a dedicated audited workspace.",
    links: [],
    state: "gap",
  },
  {
    group: "Investor Relations",
    summary: "Investor mapping and reporting administration must remain separate from investor account entitlements.",
    links: [],
    state: "gap",
  },
  {
    group: "Audit & Settings",
    summary: "Use the existing operations desk for current audit and governance surfaces.",
    links: [{ label: "Operations & audit", to: "/internal" }, { label: "Admin workstations", to: "/admin/workstations" }],
    state: "available",
  },
] as const;

const STATE_LABEL: Record<(typeof WORK_AREAS)[number]["state"], string> = {
  available: "Existing workspace",
  "preview-gated": "Preview gate pending",
  partial: "Partial — capability gap",
  gap: "Not implemented",
};

const ACTION_GUIDANCE: Record<string, string> = {
  QC_REVIEW: "Technical QC review is pending",
  RIGHTS_REVIEW: "Independent rights review is pending",
  LICENSING_READY: "Licensing decision is pending",
};

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

  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking Super Admin access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Super Admin access could not be verified. No administrative controls are shown.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const pending = titles.filter((title) => title.status in ACTION_GUIDANCE);
  const commercial = titles.filter((title) =>
    ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
  );
  const dataUnavailable = titlesQ.isPending || titlesQ.isError;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">StreamVista · Bridge + Loop governance</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">One control centre. Clear operational gates.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Find the next action, open its canonical workspace and preserve independent rights, payment, publication and playback approvals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/workspace" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">Open titles</Link>
          <Link to="/admin/workstations" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Open operations</Link>
        </div>
      </section>

      <section aria-labelledby="attention-title" className="rounded-2xl border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h3 id="attention-title" className="font-display text-xl font-semibold">Today · Needs attention</h3>
            <p className="mt-1 text-sm text-muted">Only the title decision states currently returned by the canonical title query.</p>
          </div>
          <p className="text-sm font-semibold tabular-nums">{dataUnavailable ? "—" : `${pending.length} pending`}</p>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-5 text-sm text-muted sm:px-5">Loading the action queue…</p>
        ) : titlesQ.isError ? (
          <p role="alert" className="px-4 py-5 text-sm text-accent sm:px-5">The action queue is unavailable. No zero count is assumed. Retry from the title workspace.</p>
        ) : pending.length ? (
          <ul className="divide-y divide-line">
            {pending.slice(0, 5).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium">{title.name}</p>
                  <p className="mt-1 text-xs text-muted">{ACTION_GUIDANCE[title.status]}</p>
                </div>
                <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">Review title →</Link>
              </li>
            ))}
            {pending.length > 5 ? <li className="px-4 py-3 text-sm text-muted sm:px-5">Showing 5 of {pending.length}; open the title workspace for the full queue.</li> : null}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted sm:px-5">No title decision is waiting in these states. This is not a claim that every title is fully cleared or published.</p>
        )}
      </section>

      <section aria-labelledby="snapshot-title" className="space-y-3">
        <div>
          <h3 id="snapshot-title" className="font-display text-lg font-semibold">Operational snapshot</h3>
          <p className="text-xs text-muted">Title-query indicators only; not payment settlement, accounting or Loop playback metrics.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Titles in current query" value={dataUnavailable ? "—" : String(titles.length)} />
          <Metric label="Needs review / decision" value={dataUnavailable ? "—" : String(pending.length)} />
          <Metric label="Live / commercial titles" value={dataUnavailable ? "—" : String(commercial.length)} />
        </div>
      </section>

      <section aria-labelledby="areas-title" className="space-y-3">
        <div>
          <h3 id="areas-title" className="font-display text-lg font-semibold">Operational workspaces</h3>
          <p className="text-sm text-muted">Grouped by the work to be done. Detailed forms and mutations stay in their canonical modules.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {WORK_AREAS.map((area) => (
            <article key={area.group} className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="font-semibold">{area.group}</h4>
                <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">{STATE_LABEL[area.state]}</span>
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{area.summary}</p>
              {area.links.length ? (
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3">
                  {area.links.map((item) => (
                    <Link key={item.label} to={item.to} className="text-sm font-semibold text-accent hover:underline">{item.label} →</Link>
                  ))}
                </div>
              ) : (
                <p className="mt-4 border-t border-line pt-3 text-xs text-muted">No route is exposed until its authorization and service contract are implemented.</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Governance boundary</h3>
        <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>• Super Admin staff permissions do not grant Buyer, Creator, Studio or Investor entitlements.</li>
          <li>• Rights approval remains independent from Super Admin operational oversight.</li>
          <li>• Loop publication does not bypass QC, legal or rights clearance.</li>
          <li>• Payment verification and playback entitlement remain separate server-side gates.</li>
          <li>• Destructive storage actions and customer communications are not exposed as dashboard shortcuts.</li>
          <li>• Organization membership and Super Admin identity must be verified before privileged access is certified.</li>
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}
