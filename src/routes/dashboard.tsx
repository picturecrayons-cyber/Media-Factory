import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { getFounderOperationalSnapshot, getFounderTrackedProductions } from "@/lib/bridge/founder-dashboard";
import { StoryConceptDesk } from "@/components/bridge/story-concept-desk";

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
  const operationalQ = useQuery({
    queryKey: ["bridge-founder-operational-snapshot"],
    queryFn: () => getFounderOperationalSnapshot(),
    retry: 1,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const titles = titlesQ.data?.titles ?? [];
  const actionItems = titles.filter((title) => title.status in ACTION_GUIDANCE);
  const founderProductions = founderProductionsQ.data?.productions ?? [];
  const reportingUnavailable = titlesQ.isError;
  const operational = operationalQ.data;
  const sumCount = (items: { count: number }[] | undefined) =>
    (items ?? []).reduce((sum, item) => sum + Number(item.count ?? 0), 0);
  const formatStatuses = (items: { status: string; count: number }[] | undefined) =>
    items?.length
      ? items.map((item) => `${item.status.replaceAll("_", " ")}: ${item.count}`).join(" · ")
      : "No records";
  const formatProfiles = (items: { account_type: string; internal_role: string; count: number }[] | undefined) =>
    items?.length
      ? items.map((item) => `${item.account_type.replaceAll("_", " ")} / ${item.internal_role.replaceAll("_", " ")}: ${item.count}`).join(" · ")
      : "No profile records";
  const formatLedger = (items: { entry_type: string; classification: string; count: number; amount_paise: number }[] | undefined) =>
    items?.length
      ? items.map((item) => `${item.entry_type} / ${item.classification}: ${item.count} · ₹${(Number(item.amount_paise) / 100).toLocaleString("en-IN")}`).join(" | ")
      : "No ledger entries";
  const operationalReady = !operationalQ.isPending && !operationalQ.isError && Boolean(operational);
  const reviewCount = operational
    ? sumCount(operational.qc) + sumCount(operational.legal) + sumCount(operational.rights)
    : 0;
  const countByStatus = (items: { status: string; count: number }[] | undefined, predicate: (status: string) => boolean) =>
    (items ?? []).filter((item) => predicate(item.status.toLowerCase())).reduce((sum, item) => sum + item.count, 0);

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
                  to="/title/$id"
                  params={{ id: title.id }}
                  className="shrink-0 text-sm font-semibold text-accent hover:underline"
                >
                  Open this title →
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
          <h3 id="business-title" className="font-display text-xl font-semibold">Live business snapshot</h3>
          <p className="mt-1 text-sm text-muted">
            Direct aggregates from canonical Bridge tables. These are record counts, not estimates or manually entered figures.
          </p>
        </div>
        {operationalQ.isPending ? (
          <p className="rounded-sm border border-line px-4 py-5 text-sm text-muted">Loading verified business totals…</p>
        ) : operationalQ.isError || !operational ? (
          <p role="alert" className="rounded-sm border border-line px-4 py-5 text-sm text-accent">Business totals are unavailable; no zero values are assumed.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Finished-film records" value={String(sumCount(operational.titleStatuses))} />
            <Stat label="QC / Legal / Rights cases" value={String(reviewCount)} />
            <Stat label="Bridge payment records" value={String(sumCount(operational.payments))} />
            <Stat label="Active buyer access" value={String(operational.activeBuyerAccess)} />
          </div>
        )}
      </section>

      <section aria-labelledby="operations-title" className="space-y-3">
        <div>
          <h3 id="operations-title" className="font-display text-xl font-semibold">Payments, licensing & operations</h3>
          <p className="mt-1 text-sm text-muted">
            Live counts from Bridge payment, entitlement, QC, legal, rights and distribution records. Other StreamVista products are not included.
          </p>
        </div>
        {operationalQ.isPending ? (
          <p className="rounded-sm border border-line px-4 py-5 text-sm text-muted">Loading operational records…</p>
        ) : operationalQ.isError || !operational ? (
          <p role="alert" className="rounded-sm border border-line px-4 py-5 text-sm text-accent">
            Operational records could not be verified. No zero values are assumed.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Bridge payment records" value={String(sumCount(operational.payments))} />
              <Stat label="Film entitlements" value={String(operational.entitlements)} />
              <Stat label="License packages" value={String(sumCount(operational.licensePackages))} />
              <Stat label="Package entitlements" value={String(operational.packageEntitlements)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-sm border border-line p-4">
                <h4 className="font-semibold">Payments</h4>
                <p className="mt-2 text-xs text-muted">
                  {operational.payments.length
                    ? operational.payments.map((item) => `${item.purpose}: ${item.status} · ${item.count}`).join(" | ")
                    : "No Bridge payment records"}
                </p>
              </article>
              <article className="rounded-sm border border-line p-4">
                <h4 className="font-semibold">QC / Legal / Rights</h4>
                <p className="mt-2 text-xs text-muted">QC: {formatStatuses(operational.qc)}</p>
                <p className="mt-1 text-xs text-muted">Legal: {formatStatuses(operational.legal)}</p>
                <p className="mt-1 text-xs text-muted">Rights: {formatStatuses(operational.rights)}</p>
              </article>
              <article className="rounded-sm border border-line p-4">
                <h4 className="font-semibold">Distribution</h4>
                <p className="mt-2 text-xs text-muted">
                  Packages: {operational.distributionPackages.length
                    ? operational.distributionPackages.map((item) => `${item.readiness_state}: ${item.count}`).join(" · ")
                    : "No destination packages"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Loop: {operational.loopPublications.length
                    ? operational.loopPublications.map((item) => `${item.authorization_status}: ${item.count}`).join(" · ")
                    : "No Loop publication records"}
                </p>
              </article>
              <article className="rounded-sm border border-line p-4">
                <h4 className="font-semibold">Services</h4>
                <p className="mt-2 text-xs text-muted">{formatStatuses(operational.serviceOrders)}</p>
              </article>
              <article className="rounded-sm border border-line p-4">
                <h4 className="font-semibold">License package delivery</h4>
                <p className="mt-2 text-xs text-muted">
                  {operational.licensePackages.length
                    ? operational.licensePackages.map((item) => `${item.status} / ${item.delivery_status}: ${item.count}`).join(" · ")
                    : "No license package records"}
                </p>
              </article>
              <article className="rounded-sm border border-line p-4">
                <h4 className="font-semibold">Entitlement access types</h4>
                <p className="mt-2 text-xs text-muted">
                  {operational.entitlementsByAccessType.length
                    ? operational.entitlementsByAccessType.map((item) => `${item.access_type}: ${item.count}`).join(" · ")
                    : "No film entitlements"}
                </p>
              </article>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="live-modules-title" className="space-y-3">
        <div>
          <h3 id="live-modules-title" className="font-display text-xl font-semibold">Live module status</h3>
          <p className="mt-1 text-sm text-muted">
            Each summary is read from its owning Bridge table. Open the linked workspace for full records and authorized actions.
          </p>
        </div>
        {operationalQ.isPending ? (
          <p className="rounded-sm border border-line px-4 py-5 text-sm text-muted">Loading module sources…</p>
        ) : operationalQ.isError || !operational ? (
          <p role="alert" className="rounded-sm border border-line px-4 py-5 text-sm text-accent">Module data could not be verified. Retry before taking action.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">Titles & media</h4>
              <p className="mt-2 text-sm text-muted">Films: {sumCount(operational.titleStatuses)} · Assets: {sumCount(operational.assets)}</p>
              <p className="mt-1 text-xs text-muted">Title status: {formatStatuses(operational.titleStatuses)}</p>
              <p className="mt-1 text-xs text-muted">Asset processing: {formatStatuses(operational.assetProcessing)}</p>
              <Link to="/workspace" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open title workspace →</Link>
            </article>
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">Creators & producers</h4>
              <p className="mt-2 text-xs text-muted">{formatProfiles(operational.profiles)}</p>
              <p className="mt-1 text-xs text-muted">Organizations: {formatStatuses(operational.organizations)}</p>
              <Link to="/internal" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open people & access →</Link>
            </article>
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">QC, legal & rights</h4>
              <p className="mt-2 text-xs text-muted">QC: {formatStatuses(operational.qc)}</p>
              <p className="mt-1 text-xs text-muted">Legal: {formatStatuses(operational.legal)}</p>
              <p className="mt-1 text-xs text-muted">Rights: {formatStatuses(operational.rights)}</p>
              <Link to="/admin/workstations" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open review workstations →</Link>
            </article>
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">Buyers & licensing</h4>
              <p className="mt-2 text-xs text-muted">Buyer interest: {formatStatuses(operational.buyerInterest)}</p>
              <p className="mt-1 text-xs text-muted">Active title access: {operational.activeBuyerAccess}</p>
              <p className="mt-1 text-xs text-muted">Film entitlements: {operational.entitlements} · Package entitlements: {operational.packageEntitlements}</p>
              <Link to="/buyer" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open buyer & licensing →</Link>
            </article>
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">Distribution & delivery</h4>
              <p className="mt-2 text-xs text-muted">Destination packages: {operational.distributionPackages.map((item) => `${item.readiness_state}: ${item.count}`).join(" · ") || "No records"}</p>
              <p className="mt-1 text-xs text-muted">Loop authorizations: {operational.loopPublications.map((item) => `${item.authorization_status}: ${item.count}`).join(" · ") || "No records"}</p>
              <p className="mt-1 text-xs text-muted">Ingest: {formatStatuses(operational.ingestSessions)}</p>
              <Link to="/deliveries" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open deliveries →</Link>
            </article>
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">Payments & finance</h4>
              <p className="mt-2 text-xs text-muted">Payments: {operational.payments.map((item) => `${item.purpose} / ${item.status}: ${item.count}`).join(" · ") || "No records"}</p>
              <p className="mt-1 text-xs text-muted">Ledger: {formatLedger(operational.ledger)}</p>
              <Link to="/buyer" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open licensing workspace →</Link>
            </article>
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">People & access</h4>
              <p className="mt-2 text-xs text-muted">Pending invitations: {operational.pendingInvites}</p>
              <p className="mt-1 text-xs text-muted">{formatProfiles(operational.profiles)}</p>
              <Link to="/internal" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open internal access →</Link>
            </article>
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">CMS & website</h4>
              <p className="mt-2 text-xs text-muted">Managed content records: {operational.cmsRecords}</p>
              <Link to="/cms" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open website CMS →</Link>
            </article>
            <article className="rounded-sm border border-line p-4">
              <h4 className="font-semibold">Audit & failed workflows</h4>
              <p className="mt-2 text-xs text-muted">Recent audit activity: {operational.auditActivity.map((item) => `${item.action}: ${item.count}`).join(" · ") || "No recent audit events"}</p>
              <p className="mt-1 text-xs text-muted">Webhook processing: {formatStatuses(operational.webhooks)}</p>
              <p className="mt-1 text-xs text-muted">Failed webhooks: {countByStatus(operational.webhooks, (status) => /fail|error|dead/.test(status))}</p>
              <Link to="/admin/workstations" className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">Open operational review →</Link>
            </article>
          </div>
        )}
      </section>

      <section aria-labelledby="portfolio-title" className="space-y-3">
        <div>
          <h3 id="portfolio-title" className="font-display text-xl font-semibold">Title portfolio</h3>
          <p className="mt-1 text-sm text-muted">
            A simple count by content lane. Buyer visibility still depends on server-side publication and rights gates.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {operationalReady ? (
            operational.titleLanes.map((lane) => (
              <article key={lane.content_type} className="rounded-sm border border-line px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-muted">{lane.content_type.replaceAll("_", " ")}</p>
                <p className="mt-1 text-2xl font-semibold">{lane.count}</p>
                <p className="mt-1 text-xs text-muted">Finished-film records</p>
              </article>
            ))
          ) : (
            <p className="text-sm text-muted">Title-lane totals unavailable until the canonical data source responds.</p>
          )}
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
                {item.record ? (
                  <Link
                    to="/title/$id"
                    params={{ id: item.record.id }}
                    className="mt-4 inline-flex text-xs font-semibold text-accent hover:underline"
                  >
                    Open title workspace →
                  </Link>
                ) : (
                  <p className="mt-4 text-xs text-muted">Workspace link unavailable until one record is verified.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <StoryConceptDesk />

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
