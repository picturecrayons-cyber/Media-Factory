import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import { getFounderTrackedProductions } from "@/lib/bridge/founder-dashboard";

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

const ADMIN_MODULES = [
  {
    title: "Titles & media",
    description: "Title records, metadata, artwork, uploads, QC and rights.",
    to: "/workspace",
  },
  {
    title: "Operations & approvals",
    description: "Operational review workstations and approval queues.",
    to: "/admin/workstations",
  },
  {
    title: "Buyer desk & licensing",
    description: "Buyer activity, offers and licensing workflow.",
    to: "/buyer",
  },
  {
    title: "Deliveries & services",
    description: "Delivery work and service requests.",
    to: "/deliveries",
  },
  {
    title: "People & access",
    description: "Internal users, invitations and access profiles.",
    to: "/internal",
  },
  {
    title: "CMS & site content",
    description: "Bridge-managed website content.",
    to: "/cms",
  },
] as const;

const ACTION_GUIDANCE: Record<string, string> = {
  QC_REVIEW: "QC review is pending",
  RIGHTS_REVIEW: "Rights review is pending",
  LICENSING_READY: "Licensing decision is pending",
};

function DashboardBody() {
  // RequireBridge has already completed the verified Super Admin check.
  // Do not repeat the same auth/profile lookup here: a second session request
  // previously left the live Founder Centre stuck at "Checking access…".
  const titlesQ = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
    retry: 1,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const founderProductionsQ = useQuery({
    queryKey: ["bridge-founder-tracked-productions"],
    queryFn: () => getFounderTrackedProductions(),
    retry: 1,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const titles = titlesQ.data?.titles ?? [];
  const actionItems = titles.filter((title) => title.status in ACTION_GUIDANCE);
  const founderProductions = founderProductionsQ.data?.productions ?? [];
  const liveOrCommercial = titles.filter((title) =>
    ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
  );
  const readyToList = titles.filter((title) => title.status === "LICENSING_READY").length;
  const activeDeals = titles.filter((title) =>
    title.status === "LICENSED" || title.status === "IN_NEGOTIATION",
  ).length;
  const licensedValuePaise = titles.reduce(
    (sum, title) =>
      title.status === "LICENSED" || title.status === "DELIVERED"
        ? sum + title.licensingFeePaise
        : sum,
    0,
  );
  const reportingUnavailable = titlesQ.isError;
  const metricValue = (value: number) =>
    titlesQ.isPending || reportingUnavailable ? "—" : String(value);
  const moneyValue =
    titlesQ.isPending || reportingUnavailable
      ? "—"
      : `₹${(licensedValuePaise / 100).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Crayons Bridge · Super Admin
          </p>
          <h2 className="font-display text-3xl font-semibold">Founder control centre</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            One place to see what needs attention, understand the business and open the right workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/workspace"
            className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]"
          >
            Open titles
          </Link>
          <Link
            to="/admin/workstations"
            className="rounded-sm border border-line px-4 py-2 text-sm font-semibold"
          >
            Open operations
          </Link>
        </div>
      </section>

      <section aria-labelledby="today-title" className="rounded-sm border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
          <div>
            <h3 id="today-title" className="font-display text-xl font-semibold">Needs your attention</h3>
            <p className="mt-1 text-sm text-muted">
              Only titles in review or licensing-decision states are listed here.
            </p>
          </div>
          <p className="text-sm font-semibold">
            {titlesQ.isPending || reportingUnavailable ? "—" : actionItems.length} pending
          </p>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-6 text-sm text-muted">Loading the action queue…</p>
        ) : reportingUnavailable ? (
          <p role="alert" className="px-4 py-6 text-sm text-accent">
            The action queue could not be loaded. Refresh to retry; no zero values are assumed.
          </p>
        ) : actionItems.length ? (
          <ul className="divide-y divide-line">
            {actionItems.slice(0, 6).map((title) => (
              <li
                key={title.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{title.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {ACTION_GUIDANCE[title.status]} · {title.status.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
                <Link
                  to="/workspace"
                  className="shrink-0 text-sm font-semibold text-accent hover:underline"
                >
                  Review in workspace →
                </Link>
              </li>
            ))}
            {actionItems.length > 6 && (
              <li className="px-4 py-3 text-sm text-muted">
                Showing 6 of {actionItems.length}.{" "}
                <Link to="/workspace" className="font-semibold text-accent hover:underline">
                  View all titles
                </Link>
              </li>
            )}
          </ul>
        ) : (
          <div className="px-4 py-6">
            <p className="font-medium">No title decision is waiting in these states.</p>
            <p className="mt-1 text-sm text-muted">
              This does not mean every title is published or commercially ready. Check the title workspace for drafts and other workflow states.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="business-title" className="space-y-3">
        <div>
          <h3 id="business-title" className="font-display text-xl font-semibold">Business snapshot</h3>
          <p className="mt-1 text-sm text-muted">
            Values are derived from the current title list; they are not payment-settlement or accounting reports.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Licensed value*" value={moneyValue} />
          <Stat label="Live / commercial titles" value={metricValue(liveOrCommercial.length)} />
          <Stat label="Ready for licensing review" value={metricValue(readyToList)} />
          <Stat label="Licensed or negotiating deals" value={metricValue(activeDeals)} />
        </div>
        <p className="text-xs text-muted">
          *Sum of recorded licensing fees for licensed or delivered titles; not cash received.
        </p>
      </section>

      <section aria-labelledby="portfolio-title" className="space-y-3">
        <div>
          <h3 id="portfolio-title" className="font-display text-xl font-semibold">Title portfolio</h3>
          <p className="mt-1 text-sm text-muted">
            A simple count by content lane. Buyer visibility still depends on server-side publication and rights gates.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BRIDGE_LOOP_LANES.map((lane) => (
            <article key={lane.id} className="rounded-sm border border-line px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-muted">{lane.label}</p>
              <p className="mt-1 text-2xl font-semibold">
                {titlesQ.isPending || reportingUnavailable
                  ? "—"
                  : titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length}
              </p>
              <p className="mt-1 text-xs text-muted">Titles in this content lane</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="founder-productions-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="founder-productions-title" className="font-display text-xl font-semibold">Crayons Loop · Featured productions</h3>
            <p className="mt-1 text-sm text-muted">
              Live workflow status from the canonical Bridge title records. This overview does not approve rights or publish films.
            </p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">
            Open title workspace →
          </Link>
        </div>
        {founderProductionsQ.isPending ? (
          <p className="rounded-sm border border-line px-4 py-5 text-sm text-muted">Loading production workflow…</p>
        ) : founderProductionsQ.isError ? (
          <p role="alert" className="rounded-sm border border-line px-4 py-5 text-sm text-accent">
            Workflow records could not be verified. Refresh to retry; no completion status is assumed.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {founderProductions.map((item) => (
              <article key={item.key} className="rounded-sm border border-line p-4">
                <h4 className="font-semibold">{item.label}</h4>
                {item.matchStatus === "found" && item.record ? (
                  <>
                    <p className="mt-3 text-xs uppercase tracking-widest text-muted">Current workflow stage</p>
                    <p className="mt-1 text-sm font-semibold text-accent">
                      {item.record.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-2 break-all font-mono text-[10px] text-muted">Record: {item.record.id}</p>
                    <p className="mt-2 text-sm text-muted">
                      Creator / Producer: {item.record.ownerDisplayName || item.record.ownerOrganizationName || "Not available"}
                    </p>
                    {item.record.credits.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-muted">
                        {item.record.credits.slice(0, 4).map((credit, index) => (
                          <li key={`${credit.role}-${credit.name}-${index}`}>{credit.role}: {credit.name}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : item.matchStatus === "ambiguous" ? (
                  <p className="mt-3 text-sm text-accent">
                    Multiple matching records found ({item.matchCount}). Manual record reconciliation is required; no record was selected.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted">No exact canonical Bridge title record found.</p>
                )}
                <Link to="/workspace" className="mt-4 inline-flex text-xs font-semibold text-accent hover:underline">
                  Open title workspace →
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="workspaces-title" className="space-y-3">
        <div>
          <h3 id="workspaces-title" className="font-display text-xl font-semibold">Workspaces</h3>
          <p className="mt-1 text-sm text-muted">
            Choose the workspace by the job you need to do. Access remains role-gated.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ADMIN_MODULES.map((module) => (
            <Link
              key={module.title}
              to={module.to}
              className="group rounded-sm border border-line p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold">{module.title}</h4>
                <span aria-hidden="true" className="text-accent">→</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{module.description}</p>
              <p className="mt-4 text-xs font-semibold text-accent">Open workspace</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="recent-title-records" className="rounded-sm border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 id="recent-title-records" className="font-semibold">Recently updated titles</h3>
            <p className="text-xs text-muted">Latest records returned by the title workspace query.</p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">
            View all titles →
          </Link>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-6 text-sm text-muted">Loading title records…</p>
        ) : reportingUnavailable ? (
          <p role="alert" className="px-4 py-6 text-sm text-accent">
            Title records could not be loaded. Refresh to retry.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {titles.slice(0, 6).map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{title.name}</p>
                  <p className="break-all font-mono text-[10px] text-muted">ID: {title.id}</p>
                </div>
                <span className="shrink-0 rounded-sm border border-line px-2 py-1 text-xs text-muted">
                  {title.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </li>
            ))}
            {!titles.length && (
              <li className="px-4 py-6 text-sm text-muted">
                No title records were returned by the canonical query.
              </li>
            )}
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
