import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import { getDashboardSession } from "@/lib/bridge/session";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Revenue desk">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function DashboardBody() {
  const dashboardQ = useQuery({ queryKey: ["bridge-dashboard-session"], queryFn: () => getDashboardSession(), retry: false });
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), enabled: dashboardQ.isSuccess });

  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Super admin access required.</p>;
  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading the canonical title pipeline…</p>;
  if (titlesQ.isError) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Commercial data unavailable</h2>
        <p role="alert" className="mt-2 text-sm text-muted">Bridge could not load the title records. The figures have not been refreshed.</p>
        <button type="button" className="mt-3 text-sm font-semibold text-accent underline" onClick={() => void titlesQ.refetch()}>Retry</button>
      </section>
    );
  }

  const titles = titlesQ.data?.titles ?? [];
  const buyerVisible = titles.filter((t) => t.status === "LIVE_FOR_BUYERS").length;
  const pipeline = titles.filter((t) => t.status === "LICENSING_READY").length;
  const dealStageTitles = titles.filter((t) => ["IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status)).length;
  const licensedFeeMetadataPaise = titles
    .filter((t) => t.status === "LICENSED" || t.status === "DELIVERED")
    .reduce((sum, t) => sum + t.licensingFeePaise, 0);
  const needsAction = titles.filter((t) => ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(t.status)).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Commercial overview</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">Title and licensing pipeline</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              ₹{(licensedFeeMetadataPaise / 100).toLocaleString("en-IN")} in fee metadata across licensed or delivered title records — not payment-reconciled cash revenue. {needsAction} titles are in review or ready for a decision.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/workspace" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">Review titles</Link>
            <Link to="/buyer" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Buyer desk</Link>
            <Link to="/deliveries" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Deliveries</Link>
          </div>
        </div>
      </section>

      <section aria-label="Content lanes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BRIDGE_LOOP_LANES.map((lane) => (
          <div key={lane.id} className="rounded-xl border border-line bg-surface px-4 py-4">
            <p className="text-xs uppercase tracking-widest text-muted">{lane.label}</p>
            <p className="mt-2 text-2xl font-semibold">{titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Recorded in Bridge. Loop visibility still requires the approved rights and delivery gates.</p>
          </div>
        ))}
      </section>

      <section aria-label="Commercial pipeline metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Licensed fee metadata" value={`₹${(licensedFeeMetadataPaise / 100).toLocaleString("en-IN")}`} note="Not confirmed cash receipts" />
        <Stat label="Live for buyers" value={String(buyerVisible)} note="Titles in the LIVE_FOR_BUYERS state" />
        <Stat label="Ready to list" value={String(pipeline)} note="Requires all publication gates" />
        <Stat label="Titles in deal stages" value={String(dealStageTitles)} note="Negotiation, licensed or delivered" />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Recently updated titles</h2>
            <p className="mt-1 text-sm text-muted">Open the canonical record to review its metadata, rights, QC and delivery state.</p>
          </div>
          <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">All titles →</Link>
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {titles.slice(0, 8).map((t) => (
            <li key={t.id}>
              <Link to="/title/$id" params={{ id: t.id }} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-elevated/50">
                <span className="min-w-0">
                  <span className="block font-medium">{t.name}</span>
                  <span className="mt-1 block text-xs text-muted">{t.language || "Language not set"} · {t.contentType.replaceAll("_", " ")}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted">{t.status.replaceAll("_", " ").toLowerCase()}</span>
                  <span aria-hidden="true" className="text-accent">→</span>
                </span>
              </Link>
            </li>
          ))}
          {!titles.length ? <li className="px-4 py-6 text-sm text-muted">No canonical titles yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>
    </div>
  );
}
