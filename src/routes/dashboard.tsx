import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

const PRIMARY_WORKSPACES = [
  { title: "Titles & media", description: "Title records, metadata, artwork, uploads, QC and rights.", to: "/workspace" },
  { title: "Buyer desk & licensing", description: "Buyer activity, offers and licensing workflow.", to: "/buyer" },
] as const;

const ADMIN_WORKSPACES = [
  { title: "Operations & approvals", description: "Operational review workstations and approval queues.", to: "/admin/workstations" },
  { title: "Deliveries & services", description: "Delivery work and service requests.", to: "/deliveries" },
  { title: "CMS & site content", description: "Bridge-managed website content.", to: "/cms" },
  { title: "People & access", description: "Internal users, invitations and access profiles.", to: "/internal" },
] as const;

const ACTION_GUIDANCE: Record<string, string> = {
  QC_REVIEW: "QC review",
  RIGHTS_REVIEW: "Rights review",
  LICENSING_READY: "Licensing decision",
};
const PAGE_SIZE = 8;

function DashboardBody() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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

  const titles = titlesQ.data?.titles ?? [];
  const filteredTitles = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    if (!normalized) return titles;
    return titles.filter((title) =>
      [title.name, title.status, title.id].join(" ").toLocaleLowerCase().includes(normalized),
    );
  }, [search, titles]);
  const pageCount = Math.max(1, Math.ceil(filteredTitles.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleTitles = filteredTitles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (dashboardQ.isPending) return <p className="px-1 py-4 text-sm text-muted">Checking access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="px-1 py-4 text-sm text-accent">Super admin access required.</p>;

  const needsAction = titles.filter((title) => title.status in ACTION_GUIDANCE).length;
  const live = titles.filter((title) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status));
  const pipeline = titles.filter((title) => title.status === "LICENSING_READY").length;
  const deals = titles.filter((title) => title.status === "LICENSED" || title.status === "IN_NEGOTIATION").length;
  const revenue = live.reduce((sum, title) => sum + (title.status === "LICENSED" || title.status === "DELIVERED" ? title.licensingFeePaise : 0), 0);
  const reportingUnavailable = titlesQ.isError;
  const metricValue = (value: number) => titlesQ.isPending || reportingUnavailable ? "—" : String(value);
  const moneyValue = titlesQ.isPending || reportingUnavailable ? "—" : `₹${(revenue / 100).toLocaleString("en-IN")}`;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-1 pb-8 sm:space-y-8 sm:px-2">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Super Admin</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Founder control centre</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">A clear view of the business, title pipeline and the two workspaces used most.</p>
        </div>
        <p className="shrink-0 text-sm text-muted">{metricValue(needsAction)} items need attention</p>
      </section>

      <section aria-labelledby="business-title" className="space-y-3">
        <div>
          <h3 id="business-title" className="font-display text-lg font-semibold sm:text-xl">Business snapshot</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted sm:text-sm">Based on current title records, not payment settlement or accounting data.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="Licensed value*" value={moneyValue} />
          <Stat label="Live / commercial titles" value={metricValue(live.length)} />
          <Stat label="Ready for licensing review" value={metricValue(pipeline)} />
          <Stat label="Licensed / negotiating deals" value={metricValue(deals)} />
        </div>
        <p className="text-xs text-muted">*Recorded licensing fees for licensed or delivered titles; not cash received.</p>
      </section>

      <section aria-labelledby="workspaces-title" className="space-y-3">
        <div>
          <h3 id="workspaces-title" className="font-display text-lg font-semibold sm:text-xl">Core workspaces</h3>
          <p className="mt-1 text-sm text-muted">Start with the title pipeline or buyer relationships.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {PRIMARY_WORKSPACES.map((workspace) => (
            <Link key={workspace.title} to={workspace.to} className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-5">
              <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{workspace.title}</h4><span aria-hidden="true" className="text-accent">→</span></div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{workspace.description}</p>
              <p className="mt-4 text-xs font-semibold text-accent">Open workspace</p>
            </Link>
          ))}
        </div>
      </section>

      <details className="group rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden sm:px-5">
          <span><span className="block font-semibold">Admin & operations</span><span className="mt-1 block text-xs text-muted">Advanced workspaces · approvals, delivery, site content and access</span></span>
          <span aria-hidden="true" className="text-lg text-muted transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2 sm:p-4">
          {ADMIN_WORKSPACES.map((workspace) => (
            <Link key={workspace.title} to={workspace.to} className="rounded-lg border border-line px-3 py-3 transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span className="flex items-center justify-between gap-2 text-sm font-semibold">{workspace.title}<span aria-hidden="true" className="text-accent">→</span></span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{workspace.description}</span>
            </Link>
          ))}
        </div>
      </details>

      <section aria-labelledby="title-queue-title" className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div><h3 id="title-queue-title" className="font-display text-lg font-semibold sm:text-xl">Title pipeline</h3><p className="mt-1 text-xs text-muted sm:text-sm">One searchable list for every title and its current workflow state.</p></div>
          <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">Open full title workspace →</Link>
        </div>
        <div className="space-y-3 p-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="sr-only" htmlFor="dashboard-title-search">Search titles</label>
            <input id="dashboard-title-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by title, status or ID…" className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:max-w-md" />
            <p className="text-xs text-muted" aria-live="polite">{titlesQ.isPending || reportingUnavailable ? "Title count unavailable" : `${filteredTitles.length} of ${titles.length} titles`}</p>
          </div>
          {titlesQ.isPending ? <p className="py-8 text-center text-sm text-muted">Loading title records…</p> :
           reportingUnavailable ? <p role="alert" className="py-8 text-center text-sm text-accent">Title records could not be loaded. Refresh to retry; no zero values are assumed.</p> :
           filteredTitles.length ? <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-muted"><th scope="col" className="px-2 py-3 font-medium">Title</th><th scope="col" className="px-2 py-3 font-medium">Workflow status</th><th scope="col" className="px-2 py-3 text-right font-medium">Decision</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {visibleTitles.map((title) => <tr key={title.id} className="align-middle">
                    <td className="max-w-[18rem] px-2 py-3"><span className="block truncate font-medium">{title.name}</span><span className="mt-1 block truncate font-mono text-[10px] text-muted">{title.id}</span></td>
                    <td className="px-2 py-3"><span className="inline-flex rounded-md border border-line px-2 py-1 text-xs text-muted">{title.status.replaceAll("_", " ").toLowerCase()}</span></td>
                    <td className="px-2 py-3 text-right">{title.status in ACTION_GUIDANCE ? <span className="text-xs font-medium text-accent">{ACTION_GUIDANCE[title.status]}</span> : <span className="text-xs text-muted">View record</span>}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredTitles.length)} of {filteredTitles.length}</p>
              <div className="flex items-center gap-2">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md border border-line px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                <span className="min-w-16 text-center text-xs text-muted">Page {currentPage} / {pageCount}</span>
                <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-md border border-line px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </div>
            </div>
           </> : <p className="py-8 text-center text-sm text-muted">{titles.length ? "No titles match this search." : "No title records were returned by the canonical query."}</p>}
        </div>
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
