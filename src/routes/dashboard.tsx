import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
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

const ADMIN_MODULES = [
  { title: "Bridge operations", description: "Review live title intake, QC, legal, rights, delivery and audit records.", to: "/admin/workstations" },
  { title: "LOOP administration", description: "Open the consumer platform's separately authorized admin workspace.", href: "https://crayonsloop.in/admin" },
  { title: "People & access", description: "Review internal users, invitations and access profiles.", to: "/internal" },
  { title: "Buyer desk & licensing", description: "Review buyer activity, commercial offers and licensing decisions.", to: "/buyer" },
  { title: "Website CMS", description: "Manage Bridge website content and publication.", to: "/cms" },
  { title: "Delivery oversight", description: "Inspect delivery status and evidence; execution remains backend-owned.", to: "/deliveries" },
] as const;

const ACTION_GUIDANCE: Record<string, string> = {
  PREPARING: "Submission intake decision",
  QC_REVIEW: "QC review checkpoint",
  RIGHTS_REVIEW: "Rights and legal clearance",
  LICENSING_READY: "Licensing authorization checkpoint",
};

function ModuleCard({ title, description, to, href }: { title: string; description: string; to?: string; href?: string }) {
  const className = "group rounded-sm border border-line p-4 transition-colors hover:border-accent";
  const body = <><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{title}</h4><span aria-hidden="true" className="text-accent">→</span></div><p className="mt-2 text-sm leading-relaxed text-muted">{description}</p></>;
  return href ? <a href={href} target="_blank" rel="noreferrer" className={className}>{body}</a> : <Link to={to as any} className={className}>{body}</Link>;
}

function DashboardBody() {
  const dashboardQ = useQuery({ queryKey: ["bridge-dashboard-session"], queryFn: () => getDashboardSession(), retry: false });
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), enabled: dashboardQ.isSuccess, retry: 1 });

  if (dashboardQ.isPending) return <p className="text-sm text-muted">Verifying platform access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Platform Super Admin access could not be verified.</p>;

  const titles = titlesQ.data?.titles ?? [];
  const unavailable = titlesQ.isError;
  const count = (predicate: (status: string) => boolean) => unavailable || titlesQ.isPending ? "—" : String(titles.filter((title) => predicate(title.status)).length);
  const needsDecision = titles.filter((title) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(title.status));
  const activeCommercial = titles.filter((title) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status));
  const licensedValue = unavailable || titlesQ.isPending ? "—" : "₹" + (titles.filter((t) => ["LICENSED", "DELIVERED"].includes(t.status)).reduce((sum, t) => sum + t.licensingFeePaise, 0) / 100).toLocaleString("en-IN");

  return <div className="space-y-7">
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">StreamVista Platform · Super Admin</p>
        <h2 className="font-display text-3xl font-semibold">Platform Control Centre</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">One trusted view of platform activity, decisions requiring your authority, and systems requiring attention. Backend teams own execution.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/admin/workstations" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">Review decisions</Link>
        <a href="https://crayonsloop.in/admin" target="_blank" rel="noreferrer" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Open LOOP Admin ↗</a>
      </div>
    </section>

    <section className="space-y-3" aria-labelledby="live-overview">
      <div><h3 id="live-overview" className="font-display text-xl font-semibold">Bridge portfolio overview</h3><p className="text-sm text-muted">Counts from the canonical Bridge title query. A dash means the source could not be verified.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Canonical titles" value={titlesQ.isPending || unavailable ? "—" : String(titles.length)} />
        <Stat label="Intake / review decisions" value={count((s) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(s))} />
        <Stat label="Licensing decision stage" value={count((s) => s === "LICENSING_READY")} />
        <Stat label="Live / commercial titles" value={String(unavailable || titlesQ.isPending ? "—" : activeCommercial.length)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Recorded licensed value*" value={licensedValue} />
        <Stat label="Backend reporting" value={titlesQ.isError ? "Unavailable" : titlesQ.isPending ? "Checking…" : "Connected"} />
      </div>
      <p className="text-xs text-muted">*Recorded title licensing fees for licensed or delivered titles; this is not confirmed cash received or an accounting statement.</p>
    </section>

    <section className="space-y-3" aria-labelledby="decision-queue">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="decision-queue" className="font-display text-xl font-semibold">Your decision queue</h3><p className="text-sm text-muted">Only checkpoints requiring review authority belong here. Uploading, transcoding, packaging and vendor execution remain backend responsibilities.</p></div><Link to="/admin/workstations" className="text-sm font-semibold text-accent hover:underline">Open decision workspace →</Link></div>
      {titlesQ.isPending ? <PanelMessage>Loading verified decision records…</PanelMessage> : unavailable ? <PanelMessage role="alert">Decision records are unavailable. No empty queue is being assumed.</PanelMessage> : needsDecision.length ? <div className="divide-y divide-line rounded-sm border border-line">{needsDecision.slice(0,8).map((title) => <div key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="font-medium">{title.name}</p><p className="text-xs text-muted">{ACTION_GUIDANCE[title.status] ?? title.status}</p></div><Link to="/title/$id" params={{id:title.id}} className="text-sm font-semibold text-accent">Inspect record →</Link></div>)}</div> : <PanelMessage>No title decisions are currently recorded in the listed checkpoints. This does not certify all titles as approved or published.</PanelMessage>}
    </section>

    <section className="space-y-3" aria-labelledby="health-boundaries">
      <div><h3 id="health-boundaries" className="font-display text-xl font-semibold">Platform health & release boundaries</h3><p className="text-sm text-muted">Known verification status—not guessed health indicators.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatusPanel title="Bridge Preview" status="Runtime verification blocked" detail="Preview requires its branch-scoped Testing DATABASE_URL before authenticated runtime checks." />
        <StatusPanel title="Super Admin security" status="MFA / AAL2 verification required" detail="Privileged actions must remain locked until authenticator enrollment and AAL2 are verified." />
        <StatusPanel title="LOOP catalogue" status="Public API previously verified" detail="Testing catalogue has no eligible titles; authenticated identity, playback and account-isolation E2E remain pending." />
      </div>
      <p className="text-xs text-muted">These known blockers are sourced from the current release review. They do not replace live health probes.</p>
    </section>

    <section className="space-y-3" aria-labelledby="platform-workspaces">
      <div><h3 id="platform-workspaces" className="font-display text-xl font-semibold">Platform workspaces</h3><p className="text-sm text-muted">Open the right system. Each destination retains its own server-side authorization.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ADMIN_MODULES.map((m) => <ModuleCard key={m.title} {...m} />)}</div>
    </section>

    <section className="rounded-sm border border-line p-4">
      <h3 className="font-semibold">Operating principle</h3>
      <p className="mt-1 text-sm text-muted">You make approvals, holds and platform-level decisions. Backend automation and authorized workstations handle execution. No QC, legal, rights, payment or publication gate is bypassed by dashboard access.</p>
    </section>
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-sm border border-line p-4">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}

function PanelMessage({ children, role }: { children: React.ReactNode; role?: "alert" }) {
  return <div role={role} className="rounded-sm border border-dashed border-line px-4 py-5 text-sm text-muted">{children}</div>;
}

function StatusPanel({ title, status, detail }: { title: string; status: string; detail: string }) {
  return <article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">{title}</p><p className="mt-2 font-semibold">{status}</p><p className="mt-1 text-sm leading-relaxed text-muted">{detail}</p></article>;
}

