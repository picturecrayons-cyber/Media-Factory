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
  const liveTitles = titles.filter((title) =>
    ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
  ).length;
  const rightsReview = titles.filter((title) => title.status === "RIGHTS_REVIEW").length;
  const qcReview = titles.filter((title) => title.status === "QC_REVIEW").length;
  const licensingReady = titles.filter((title) => title.status === "LICENSING_READY").length;
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
        <Link to="/workspace" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">
          Open title library
        </Link>
      </header>

      <section aria-label="Business overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Title records" value={value(titles.length)} />
        <Metric label="QC reviews" value={value(qcReview)} />
        <Metric label="Rights reviews" value={value(rightsReview)} />
        <Metric label="Live / commercial" value={value(liveTitles)} />
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
          <h3 id="workspaces-heading" className="font-semibold">Workspaces</h3>
          <p className="mt-1 text-xs text-muted">Four places to run the business. Detailed tools stay inside each workspace.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Workspace title="Title Library" description="Titles, Creator and Studio submissions, assets and metadata." to="/workspace" />
          <Workspace title="Operations & Approvals" description="QC, Legal, review queues and audit." to="/admin/workstations" />
          <Workspace title="Distribution & Revenue" description="Buyer desk, licensing, Loop publication and finance." to="/buyer" />
          <Workspace title="People & Website" description="Access, internal users and website CMS." to="/internal" secondary={{ label: "Website CMS", to: "/cms" }} />
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <span>{titlesQ.isPending || failed ? "Portfolio status unavailable" : `${licensingReady} titles ready for licensing review`}</span>
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
