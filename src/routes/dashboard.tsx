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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Super Admin</p>
          <h2 className="mt-1 font-display text-3xl font-semibold">Founder Centre</h2>
          <p className="mt-1 text-sm text-muted">Your daily overview. Open a workspace only when action is needed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/workspace" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">
            Open title library
          </Link>
          <Link to="/internal" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">
            Open operations
          </Link>
        </div>
      </header>

      <section aria-label="Business overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Master titles" value={value(titles.length)} />
        <Metric label="Pending review" value={value(needsDecision.length)} />
        <Metric label="Authorized buyer listings" value={value(authorizedListings)} />
        <Metric label="Commercial deals" value={value(commercialDeals)} />
      </section>

      <section className="overflow-hidden rounded-sm border border-line" aria-labelledby="attention-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 id="attention-heading" className="font-semibold">Needs attention</h3>
            <p className="mt-1 text-xs text-muted">Only decisions that require a review are shown here.</p>
          </div>
          <span className="text-sm font-semibold">{titlesQ.isPending || failed ? "—" : needsDecision.length} items</span>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-6 text-sm text-muted">Loading decision queue…</p>
        ) : failed ? (
          <p role="alert" className="px-4 py-6 text-sm text-accent">Dashboard data unavailable. Refresh to retry; no zero values are assumed.</p>
        ) : needsDecision.length ? (
          <ul className="divide-y divide-line">
            {needsDecision.slice(0, 5).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{title.name}</p>
                  <p className="mt-1 text-xs text-muted">{DECISION_STATES[title.status]}</p>
                </div>
                <Link to="/workspace" className="shrink-0 text-sm font-semibold text-accent hover:underline">
                  Review title →
                </Link>
              </li>
            ))}
            {needsDecision.length > 5 ? (
              <li className="px-4 py-3 text-xs text-muted">
                {needsDecision.length - 5} more decision items · <Link to="/workspace" className="font-semibold text-accent">Open title library</Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted">No QC, rights or licensing decisions are currently waiting.</p>
        )}
      </section>

      <section aria-labelledby="workspaces-heading" className="space-y-3">
        <div>
          <h3 id="workspaces-heading" className="font-semibold">Business workspaces</h3>
          <p className="mt-1 text-xs text-muted">Executive overview stays here; detailed operational records remain in their dedicated workspaces.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Workspace title="Titles & Media" description="Master title library, Creator/Studio submissions, assets, metadata and QC." to="/workspace" />
          <Workspace title="Rights & Legal" description="Rights evidence, agreements, independent reviews and approval decisions." to="/admin/workstations" />
          <Workspace title="Buyer Management" description="Independent Buyer accounts and their own licensing access." to="/buyer-management" />
          <Workspace title="Distribution Control" description="Loop authorization, destinations, delivery and publication state." to="/internal" />
          <Workspace title="Revenue & Finance" description="Buyer deals, captured payments, ledger and reconciliation work." to="/admin" />
          <Workspace title="People & Access" description="Creator, Studio, Buyer and internal roles with controlled access." to="/internal" />
          <Workspace title="Website & Loop Gateway" description="Bridge website CMS and separate Loop publication controls." to="/cms" />
          <Workspace title="Audit & Security" description="Operational history, access decisions and audit evidence." to="/internal" />
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <span>Bridge authorizes. Loop delivers. Buyer access remains title- and scope-specific.</span>
        <Link to="/admin/workstations" className="font-semibold text-accent hover:underline">Open operations →</Link>
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Workspace({
  title,
  description,
  to,
  secondary,
}: {
  title: string;
  description: string;
  to: string;
  secondary?: { label: string; to: string };
}) {
  return (
    <article className="flex items-center justify-between gap-3 rounded-sm border border-line px-4 py-4">
      <div className="min-w-0">
        <h4 className="font-semibold">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        {secondary ? (
          <Link to={secondary.to} className="mt-2 inline-block text-xs font-semibold text-muted hover:text-accent">
            {secondary.label} →
          </Link>
        ) : null}
      </div>
      <Link to={to} className="shrink-0 text-sm font-semibold text-accent hover:underline">Open →</Link>
    </article>
  );
}
