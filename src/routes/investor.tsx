import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listInvestorInvestments } from "@/lib/bridge/investor";

export const Route = createFileRoute("/investor")({ component: Investor });

function Investor() {
  return (
    <RequireBridge allow="investor">
      {(actor) => (
        <BridgeShell actor={actor} title="Investor desk">
          <InvestorBody userId={actor.userId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InvestorBody({ userId }: { userId: string }) {
  const investmentsQ = useQuery({
    queryKey: ["bridge-investor-investments", userId],
    queryFn: () => listInvestorInvestments(),
  });
  const rows = investmentsQ.data?.investments ?? [];
  const totalCapital = rows.reduce((sum, row) => sum + Number(row.investedAmountPaise ?? 0), 0);
  const totalParticipation = rows.reduce((sum, row) => sum + Number(row.participationPercent ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Scope</p><p className="mt-2 text-sm">Assigned titles only. Read participation. No title edits.</p></article>
        <article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Opportunity</p><p className="mt-2 text-sm">Capital is recorded by Bridge. You see only titles assigned to this account.</p></article>
        <article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Recorded capital</p><p className="mt-2 text-2xl font-semibold">₹{Math.round(totalCapital / 100).toLocaleString("en-IN")}</p></article>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Portfolio</p><h3 className="mt-1 font-display text-2xl font-semibold">Your investments</h3></div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-3 py-3">Title</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Capital</th><th className="px-3 py-3">Participation</th><th className="px-3 py-3">Recorded</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => <tr key={row.id}><td className="px-3 py-3"><Link to="/title/$id" params={{ id: row.titleId }} className="font-medium hover:text-accent">{row.titleName}</Link></td><td className="px-3 py-3">{row.investmentReference ?? "—"}</td><td className="px-3 py-3">₹{Math.round(Number(row.investedAmountPaise ?? 0) / 100).toLocaleString("en-IN")}</td><td className="px-3 py-3">{Number(row.participationPercent ?? 0).toFixed(2)}%</td><td className="px-3 py-3">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td></tr>)}
              {!rows.length ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No investment records are assigned to this account yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

