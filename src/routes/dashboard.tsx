import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import { getDashboardSession } from "@/lib/bridge/session";
import { getRevenueDeskSummary } from "@/lib/bridge/revenue-dashboard";

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

function money(paise: number) {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function DashboardBody() {
  const dashboardQ = useQuery({ queryKey: ["bridge-dashboard-session"], queryFn: () => getDashboardSession(), retry: false });
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), enabled: dashboardQ.isSuccess });
  const financeQ = useQuery({
    queryKey: ["bridge-revenue-desk-summary"],
    queryFn: () => getRevenueDeskSummary(),
    enabled: dashboardQ.isSuccess,
    retry: false,
  });
  if (dashboardQ.isPending) return <p className="text-sm text-muted">Checking access…</p>;
  if (dashboardQ.isError) return <p role="alert" className="text-sm text-accent">Super admin access required.</p>;
  const titles = titlesQ.data?.titles ?? [];
  const live = titles.filter((t) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status));
  const pipeline = titles.filter((t) => t.status === "LICENSING_READY").length;
  const deals = titles.filter((t) => t.status === "LICENSED" || t.status === "IN_NEGOTIATION").length;
  // This is a title-recorded licence fee metric, not proof of collected cash.
  const recordedLicenceFees = titles.reduce((sum, t) =>
    sum + (t.status === "LICENSED" || t.status === "DELIVERED" ? t.licensingFeePaise : 0), 0);
  const needsAction = titles.filter((t) => ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(t.status)).length;
  const finance = financeQ.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Revenue desk</h2>
          <p className="mt-1 text-sm text-muted">
            {needsAction} titles need a decision. Cash and service revenue below come from the financial ledger, not title status.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/workspace" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">Titles</Link>
          <Link to="/buyer" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Buyer desk</Link>
          <Link to="/deliveries" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Deliveries</Link>
        </div>
      </div>

      <section className="space-y-3 rounded-sm border border-line p-4 sm:p-5">
        <div>
          <h3 className="font-display text-xl font-semibold">Service revenue & collections</h3>
          <p className="mt-1 text-sm text-muted">Read-only figures from verified service payments, invoices and ledger entries. INR amounts.</p>
        </div>
        {financeQ.isPending ? (
          <p className="text-sm text-muted">Loading financial records…</p>
        ) : financeQ.isError || !finance?.available ? (
          <p role="status" className="rounded-sm border border-line p-3 text-sm text-muted">
            {finance?.reason ?? "Financial summary unavailable. No financial figures are shown until the finance schema and access are ready."}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Recognized service revenue (net of refunds)" value={money(finance.recognizedRevenuePaise ?? 0)} />
              <Stat label="Net paid invoice value after refunds" value={money(finance.paidInvoiceValuePaise ?? 0)} />
              <Stat label="Operating & payment costs recorded" value={money(finance.operatingCostsPaise ?? 0)} />
              <Stat label="Net contribution (recorded costs)" value={money(finance.netContributionPaise ?? 0)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Paid invoices" value={String(finance.paidInvoiceCount ?? 0)} />
              <Stat label="Orders with recognized revenue" value={String(finance.ordersWithRevenueCount ?? 0)} />
              <Stat label="Payment pending" value={String(finance.pendingPaymentCount ?? 0)} />
            </div>
            <p className="text-xs text-muted">These totals reflect recorded ledger entries only. They do not imply that a title has cleared rights, passed QC, or been authorized for distribution.</p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Rights & licensing pipeline</h3>
          <p className="mt-1 text-sm text-muted">Bridge controls title readiness and buyer authorization. Loop delivery remains separately gated.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BRIDGE_LOOP_LANES.map((lane) => (
            <div key={lane.id} className="rounded-sm border border-line px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-muted">{lane.label}</p>
              <p className="mt-1 text-2xl font-semibold">{titles.filter((title) => loopStageType(title.contentType) === lane.loopType).length}</p>
              <p className="text-xs text-muted">Loop availability requires an explicit Bridge publication grant.</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Title-recorded licence fees (not cash receipts)" value={money(recordedLicenceFees)} />
          <Stat label="Live for buyers" value={String(live.length)} />
          <Stat label="Ready to list" value={String(pipeline)} />
          <Stat label="Active deals" value={String(deals)} />
        </div>
        <ul className="divide-y divide-line rounded-sm border border-line">
          {titles.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="font-medium">{t.name}</span>
              <span className="text-muted">{t.status.replaceAll("_", " ").toLowerCase()}</span>
            </li>
          ))}
          {!titles.length && <li className="px-4 py-6 text-sm text-muted">No titles yet.</li>}
        </ul>
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
