import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listInvestorInvestments } from "@/lib/bridge/investor";
import { TitleFinanceWorkspace } from "@/components/bridge/title-finance-workspace";

export const Route = createFileRoute("/investor")({ component: Investor });

function Investor() {
  return (
    <RequireBridge allow="investor">
      {(actor) => (
        <BridgeShell actor={actor} title="Investor desk">
          <InvestorBody actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InvestorBody({ actor }: { actor: { userId: string; accountType: string; internalRole: string | null } }) {
  const userId = actor.userId;
  const investmentsQ = useQuery({
    queryKey: ["bridge-investor-investments", userId],
    queryFn: () => listInvestorInvestments(),
  });
  const rows = investmentsQ.data?.investments ?? [];
  const totalCapital = rows.reduce((sum, row) => sum + Number(row.investedAmountPaise ?? 0), 0);

  return (
    <div className="space-y-6">
      {investmentsQ.isPending ? <p className="text-sm text-muted">Loading your assigned investment records…</p> : null}
      {investmentsQ.isError ? (
        <p role="alert" className="rounded-sm border border-line p-4 text-sm text-muted">
          Your portfolio could not be loaded. Totals are hidden until the authenticated data source responds.
        </p>
      ) : null}
      {!investmentsQ.isPending && !investmentsQ.isError ? <>
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Scope</p><p className="mt-2 text-sm">Assigned titles only. Read participation. No title edits.</p></article>
        <article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Opportunity</p><p className="mt-2 text-sm">Capital is recorded by Bridge. You see only titles assigned to this account.</p></article>
        <article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Recorded capital</p><p className="mt-2 text-2xl font-semibold">₹{Math.round(totalCapital / 100).toLocaleString("en-IN")}</p></article>
      </section>

      <section aria-labelledby="investor-payment-heading" className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Payment readiness</p>
        <h3 id="investor-payment-heading" className="mt-1 font-display text-xl font-semibold">Investment offer & payment</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">Investor payments are separate from Buyer licensing payments. A Razorpay order may be created only against a specific Super Admin-approved investment offer, verified investor identity, disclosed amount and currency, and counsel-approved offer documents. Payment does not itself create equity, ownership, participation or a return guarantee.</p>
        <div className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">Checkout is not enabled yet. No investment amount has been requested or charged. Request an approved offer and its legal documents before payment activation.</div>
        <Link to="/contact" className="mt-4 inline-flex text-sm font-semibold text-accent underline">Request investment offer documents →</Link>
      </section>

      <section aria-labelledby="investor-gallery-heading" className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Approved materials</p>
        <h3 id="investor-gallery-heading" className="mt-1 font-display text-xl font-semibold">Investment Presentation Gallery</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">Only investor-specific presentation assets explicitly assigned to this verified account may appear here. Title masters, buyer screeners and private production documents are not part of the investor gallery.</p>
        <div className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">No investor presentation assets are currently assigned to this account. This gallery will remain empty until approved investor materials are provided through a separately authorized workflow.</div>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Portfolio</p><h3 className="mt-1 font-display text-2xl font-semibold">Your investments</h3></div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-3 py-3">Title</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Capital</th><th className="px-3 py-3">Participation</th><th className="px-3 py-3">Recorded</th><th className="px-3 py-3">Contact</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => <tr key={row.id}><td className="px-3 py-3"><Link to="/title/$id" params={{ id: row.titleId }} className="font-medium hover:text-accent">{row.titleName}</Link></td><td className="px-3 py-3">{row.investmentReference ?? "—"}</td><td className="px-3 py-3">₹{Math.round(Number(row.investedAmountPaise ?? 0) / 100).toLocaleString("en-IN")}</td><td className="px-3 py-3">{Number(row.participationPercent ?? 0).toFixed(2)}%</td><td className="px-3 py-3">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td><td className="px-3 py-3"><a className="font-semibold text-accent underline" href={`mailto:abijithasokan@crayonspictures.com?subject=${encodeURIComponent(`Crayons Bridge investment enquiry — ${row.titleName}`)}&body=${encodeURIComponent(`Title: ${row.titleName}\\nBridge Title ID: ${row.titleId}\\nInvestor account: ${userId}\\n\\nPlease contact me regarding this title and its investment information.`)}`}>Enquire</a></td></tr>)}
              {!rows.length ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">No investment records are assigned to this account yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      </> : null}
      <section aria-label="Verified investor return statements"><TitleFinanceWorkspace actor={actor} /></section>
    </div>
  );
}

