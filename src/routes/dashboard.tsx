import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";

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
] as const;

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 15_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000} seconds`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

const RELEASE_TARGETS = [
  { name: "Pranayam 1947", aliases: ["pranayam 1947"] },
  { name: "Jananam 1947 Pranayam Thudarunnu", aliases: ["jananam 1947 pranayam thudarunnu"] },
  { name: "Malayalakkara Residency", aliases: ["malayalakkara residency"] },
] as const;

function FounderHome() {
  // RequireBridge has already resolved and authorized the Super Admin actor.
  // Avoid a second session query before starting dashboard data requests.
  const titlesQ = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => withTimeout(listTitles(), "Title records"),
    retry: false,
  });
  const releaseQ = useQuery({
    queryKey: ["bridge-loop-publication-readiness"],
    queryFn: () => withTimeout(listLoopPublicationReadiness(), "3-Film release readiness"),
    retry: false,
  });

  const titles = titlesQ.data?.titles ?? [];
  const pending = titles.filter((title) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(title.status));
  const live = titles.filter((title) => title.status === "LIVE_FOR_BUYERS");
  const value = (n: number) => titlesQ.isPending ? "Loading…" : titlesQ.isError ? "Unavailable" : String(n);

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

      <section aria-labelledby="three-film-release-title" className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Bridge authorizes → Loop delivers</p>
            <h3 id="three-film-release-title" className="mt-1 font-display text-xl font-semibold">3-Film Release Control</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted">Read-only view from the Bridge publication-readiness evaluator. This dashboard cannot approve, authorize or publish a title.</p>
          </div>
          <button type="button" onClick={() => void releaseQ.refetch()} disabled={releaseQ.isFetching} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50">
            {releaseQ.isFetching ? "Checking…" : "Refresh release status"}
          </button>
        </div>
        {releaseQ.isPending ? (
          <p className="py-6 text-sm text-muted">Checking Bridge release evidence…</p>
        ) : releaseQ.isError ? (
          <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line p-4 text-sm">
            <p className="text-accent">Release readiness data is unavailable. No title is assumed ready.</p>
            <button type="button" onClick={() => void releaseQ.refetch()} className="rounded-lg border border-line px-3 py-1.5 font-semibold">Retry</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {RELEASE_TARGETS.map((target) => {
              const matches = releaseQ.data.titles.filter((item) => target.aliases.includes(item.name.trim().toLowerCase()));
              const item = matches.length === 1 ? matches[0] : null;
              const gate = (label: string, status: string) => ({ label, status });
              const hasBlocker = (phrase: string) => item?.blockers.some((blocker) => blocker.toLowerCase().includes(phrase.toLowerCase())) ?? true;
              const clearedStatuses = ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"];
              const publicationStatus = item?.publication?.authorizationStatus ?? "NOT AUTHORIZED";
              const publicationGate = ["AUTHORIZED", "LIVE", "DELIVERED"].includes(publicationStatus)
                ? "PASS"
                : ["SUSPENDED", "EXPIRED", "REVOKED", "FAILED"].includes(publicationStatus)
                  ? "FAIL"
                  : "BLOCKED";
              const gates = [
                gate("Asset references", item ? (!item.hasMaster || !item.hasPoster ? "BLOCKED" : "NOT VERIFIED") : "NOT VERIFIED"),
                gate("Technical QC", item ? (hasBlocker("QC approval") ? "BLOCKED" : "PASS") : "NOT VERIFIED"),
                gate("Rights grant", item ? (hasBlocker("matching rights grant") ? "BLOCKED" : "PASS") : "NOT VERIFIED"),
                gate("Legal review", item ? (hasBlocker("Legal approval") ? "BLOCKED" : "PASS") : "NOT VERIFIED"),
                gate("Licensing", item ? (clearedStatuses.includes(item.bridgeStatus) ? "PASS" : "BLOCKED") : "NOT VERIFIED"),
                gate("Bridge publication authorization", item ? publicationGate : "NOT VERIFIED"),
                gate("LOOP sync acknowledgement", "NOT VERIFIED"),
              ];
              const tone = (status: string) => status === "PASS" ? "text-emerald-700" : status === "FAIL" ? "text-red-700" : status === "BLOCKED" ? "text-amber-700" : "text-muted";
              return (
                <article key={target.name} className="rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold">{target.name}</h4>
                      <p className="mt-1 text-xs text-muted">
                        {item ? `Bridge status: ${item.bridgeStatus.replaceAll("_", " ")}` : matches.length > 1 ? "NOT VERIFIED · Multiple matching title records" : "NOT VERIFIED · No matching Bridge title record"}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold ${item?.ready ? "text-emerald-700" : "text-amber-700"}`}>
                      {item?.ready ? "EVALUATOR: READY" : "RELEASE HOLD"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {gates.map((entry) => (
                      <div key={entry.label} className="rounded-lg bg-canvas px-3 py-2">
                        <p className="text-xs text-muted">{entry.label}</p>
                        <p className={`mt-1 text-xs font-semibold ${tone(entry.status)}`}>{entry.status}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                    <p>QC reviewer: {item?.reviewers?.qc ?? "Not recorded"}</p>
                    <p>Legal reviewer: {item?.reviewers?.legal ?? "Not recorded"}</p>
                    <p>Last recorded verification: {item?.lastVerifiedAt ? new Date(item.lastVerifiedAt).toLocaleString("en-IN") : "NOT VERIFIED"}</p>
                    <p>LOOP status: {item?.publication?.authorizationStatus ?? "No publication record"}</p>
                  </div>
                  {item?.blockers.length ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                      {item.blockers.slice(0, 4).map((blocker) => <li key={blocker}>{blocker}</li>)}
                    </ul>
                  ) : !item ? (
                    <p className="mt-3 text-xs text-muted">The title identity must be resolved in Bridge before its release evidence can be evaluated.</p>
                  ) : (
                    <p className="mt-3 text-xs text-muted">The current evaluator reports no publication blockers. Physical OCI object read-back and LOOP delivery acknowledgement are separate verification gates.</p>
                  )}
                  {item ? <Link to="/title/$id" params={{ id: item.id }} className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">Open Bridge title →</Link> : null}
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">Important: an asset key is not proof of an OCI object checksum/read-back. A published/listed flag is not a delivery acknowledgement. Missing reviewer metadata or sync evidence remains NOT VERIFIED.</p>
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
