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
          <FounderHome />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

const WORKSPACES = [
  { title: "Titles", description: "Create titles, manage assets and see each title's current stage.", to: "/workspace", action: "Open title library" },
  { title: "Operations & approvals", description: "QC, legal, rights and operational review queues.", to: "/admin/workstations", action: "Review operations" },
  { title: "Licensing & buyers", description: "Buyer enquiries, offers, licensing and broadcast partners.", to: "/licensing", action: "Open Licensing Desk" },
  { title: "Loop Gateway", description: "Check publication eligibility and controlled Loop delivery.", to: "/cms", action: "Open Loop Gateway" },
  { title: "People & access", description: "Internal team, invitations and account access.", to: "/internal", action: "Manage access" },
  { title: "Website CMS", description: "Public homepage, website content and preview.", to: "/admin-cms", action: "Edit website" },
  { title: "Finance & reports", description: "Payment reconciliation, settlement evidence and title-owner reports.", to: "/dashboard/reports", action: "Open reports" },
] as const;

function FounderHome() {
  const sessionQ = useQuery({ queryKey: ["bridge-dashboard-session"], queryFn: () => getDashboardSession(), retry: false });
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), enabled: sessionQ.isSuccess, retry: 1 });

  if (sessionQ.isPending) return <p className="text-sm text-muted">Checking Super Admin access…</p>;
  if (sessionQ.isError) return <p role="alert" className="text-sm text-accent">Super Admin access could not be verified.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const pending = titles.filter((title) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(title.status));
  const live = titles.filter((title) => ["LIVE", "PUBLISHED", "DELIVERED"].includes(title.status));
  const value = (n: number) => titlesQ.isPending || titlesQ.isError ? "—" : String(n);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your starting point</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">What would you like to do?</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">Start with the task. Each workspace contains only the controls needed for that job. You do not need to use every module.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/workspace" className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-[#041018]">1. Open titles</Link>
          <Link to="/admin/workstations" className="rounded-xl border border-line px-5 py-3 text-sm font-semibold">2. Review pending work</Link>
          <Link to="/admin-cms" className="rounded-xl border border-line px-5 py-3 text-sm font-semibold">3. Edit public website</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Portfolio status">
        <Metric label="Bridge titles" value={value(titles.length)} detail="Canonical title records" />
        <Metric label="Needs review" value={value(pending.length)} detail="Preparation, QC or rights review" />
        <Metric label="Loop live" value={value(live.length)} detail="Status count only; publication is verified separately" />
        <Metric label="Data status" value={titlesQ.isPending ? "Loading" : titlesQ.isError ? "Unavailable" : "Connected"} detail="Unavailable is never treated as zero" />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold">Needs your attention</h3>
            <p className="mt-1 text-sm text-muted">Only current records are shown. Opening a title does not approve it.</p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">View all titles →</Link>
        </div>
        {titlesQ.isPending ? <p className="py-6 text-sm text-muted">Loading title records…</p> :
          titlesQ.isError ? <p role="alert" className="py-6 text-sm text-accent">Title records unavailable. Refresh to retry.</p> :
          pending.length ? <ul className="mt-3 divide-y divide-line">
            {pending.slice(0, 5).map((title) => <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className="font-medium">{title.name}</p><p className="text-xs text-muted">{title.status.replaceAll("_", " ")}</p></div>
              <Link to="/title/$id" params={{ id: title.id }} className="text-sm font-semibold text-accent hover:underline">Open title →</Link>
            </li>)}
          </ul> : <p className="py-6 text-sm text-muted">No titles are currently in preparation, QC review or rights review. This does not mean all titles are release-ready.</p>}
      </section>

      <section>
        <div className="mb-3"><h3 className="font-display text-xl font-semibold">Workspaces</h3><p className="mt-1 text-sm text-muted">Choose the module that matches the task you need to complete.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {WORKSPACES.map((item, index) => <Link key={item.title} to={item.to} className="group rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent">
            <div className="flex items-center justify-between gap-3"><span className="text-xs font-mono text-muted">{String(index + 1).padStart(2, "0")}</span><span className="text-accent">→</span></div>
            <h4 className="mt-3 font-semibold">{item.title}</h4>
            <p className="mt-1 min-h-10 text-sm leading-relaxed text-muted">{item.description}</p>
            <p className="mt-4 text-xs font-semibold text-accent">{item.action}</p>
          </Link>)}
        </div>
      </section>
      <p className="text-xs text-muted">Release safety: Bridge authorizes → Loop delivers. No title is published by this dashboard. QC, rights, legal, payment and publication checks remain in their dedicated workspaces.</p>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></article>;
}
