import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listSuperAdminPaymentOverview } from "@/lib/bridge/super-admin-finance";

export const Route = createFileRoute("/finance")({ component: SuperAdminFinance });

function SuperAdminFinance() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Finance & payment oversight">
          <FinanceBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function FinanceBody() {
  const overviewQ = useQuery({
    queryKey: ["super-admin-payment-overview"],
    queryFn: () => listSuperAdminPaymentOverview(),
    retry: false,
  });
  const summary = overviewQ.data?.summary ?? [];
  const recent = overviewQ.data?.recentPayments ?? [];
  const settlementSummary = overviewQ.data?.settlementSummary ?? [];
  const recentSettlements = overviewQ.data?.recentSettlements ?? [];
  const invoices = overviewQ.data?.invoices;
  const ledger = overviewQ.data?.ledger;
  const recentLedger = overviewQ.data?.recentLedger;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Governance · read only</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Payment operations overview</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Bridge payment records grouped by recorded status and currency. This view does not create orders, verify payments, issue refunds, change entitlements or contact Razorpay.
        </p>
      </section>

      {overviewQ.isPending ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading payment records…</p>
      ) : overviewQ.isError ? (
        <p role="alert" className="rounded-xl border border-line p-5 text-sm text-accent">
          Payment oversight data is unavailable. No zero balance or successful reconciliation is assumed.
        </p>
      ) : (
        <>
          <section className="space-y-3" aria-labelledby="payment-summary-title">
            <div>
              <h3 id="payment-summary-title" className="font-display text-lg font-semibold">Recorded payment totals</h3>
              <p className="text-xs text-muted">Amounts are grouped by currency and payment status; they are not bank settlement or accounting balances.</p>
            </div>
            {summary.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {summary.map((row) => (
                  <article key={row.status + row.currency} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{row.status.replaceAll("_", " ")}</p>
                      <span className="rounded-full border border-line px-2 py-1 text-[10px] text-muted">{row.currency}</span>
                    </div>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{row.paymentCount.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted">payment records</p>
                    <p className="mt-3 text-sm font-medium tabular-nums">{formatMoney(row.totalAmountPaise, row.currency)}</p>
                    <p className="text-[10px] text-muted">recorded amount</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-line p-5 text-sm text-muted">No payment rows were returned by the current query.</p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Bank reconciliation</h3><p className="mt-1 text-xs text-muted">No bank statement feed, bank connector or approved statement import format is configured.</p></div><span className="rounded-full border border-line px-2.5 py-1 text-xs">NOT CONFIGURED</span></div>
            <p className="mt-3 text-sm text-muted">Bridge payment, invoice and ledger records are not proof of bank settlement. No automatic match, unmatched-item resolution or reconciliation sign-off is claimed.</p>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-display text-lg font-semibold">Recorded settlement summaries</h3>
              <p className="text-xs text-muted">Values are recorded in Bridge settlement rows only; no bank, gateway or accounting reconciliation is performed.</p>
            </div>
            {settlementSummary.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {settlementSummary.map((row) => (
                  <article key={row.status + row.currency} className="rounded-xl border border-line bg-surface p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{row.status.replaceAll("_", " ")} · {row.currency}</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">{row.count.toLocaleString("en-IN")} records</p>
                    <p className="mt-3 text-xs text-muted">Revenue received: {formatMoney(row.revenueReceivedPaise, row.currency)}</p>
                    <p className="mt-1 text-xs text-muted">Creator payable: {formatMoney(row.creatorPayablePaise, row.currency)}</p>
                    <p className="mt-1 text-xs text-muted">Investor payable: {formatMoney(row.investorPayablePaise, row.currency)}</p>
                    <p className="mt-1 text-xs text-muted">Bridge share: {formatMoney(row.bridgeSharePaise, row.currency)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-line p-5 text-sm text-muted">No settlement summary rows are currently available.</p>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <h3 className="font-semibold">Recent settlement records</h3>
              <p className="mt-1 text-xs text-muted">Latest 50 records. Private evidence payloads and creator/investor identity details are excluded.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr><th className="px-4 py-3">Title / reference</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Revenue</th><th className="px-4 py-3">Creator payable</th><th className="px-4 py-3">Investor payable</th><th className="px-4 py-3">Settled</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recentSettlements.map((row) => (
                    <tr key={row.reference}>
                      <td className="px-4 py-3"><p className="font-medium">{row.titleName}</p><p className="mt-1 font-mono text-[10px] text-muted">{row.reference}</p></td>
                      <td className="px-4 py-3">{row.status}</td>
                      <td className="px-4 py-3 tabular-nums">{formatMoney(row.revenueReceivedPaise, row.currency)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatMoney(row.creatorPayablePaise, row.currency)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatMoney(row.investorPayablePaise, row.currency)}</td>
                      <td className="px-4 py-3 text-xs text-muted">{row.settledAt ? formatDate(row.settledAt) : "Not marked settled"}</td>
                    </tr>
                  ))}
                  {!recentSettlements.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No settlement records are currently available.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <div><h3 className="font-display text-lg font-semibold">Recent accounting ledger entries</h3><p className="text-xs text-muted">Latest 100 redacted ledger records. Internal metadata, idempotency keys and user identifiers are excluded.</p></div>
            {recentLedger?.status === "AVAILABLE" ? (
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">Title / entry</th><th className="px-4 py-3">Classification</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Recorded</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {recentLedger.rows.map(row=><tr key={row.reference}><td className="px-4 py-3"><p className="font-medium">{row.titleName??"Non-title entry"}</p><p className="mt-1 text-xs text-muted">{row.entryType.replaceAll("_"," ")}</p><p className="mt-1 font-mono text-[10px] text-muted">{row.reference}</p></td><td className="px-4 py-3">{row.classification}</td><td className="px-4 py-3 text-xs text-muted">{row.businessReference??"—"}</td><td className="px-4 py-3 tabular-nums">{formatMoney(row.amountPaise,row.currency)}</td><td className="px-4 py-3 text-xs text-muted">{formatDate(row.createdAt)}</td></tr>)}
                      {!recentLedger.rows.length?<tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No ledger entries were returned.</td></tr>:null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : <p className="rounded-xl border border-line p-5 text-sm text-muted">Detailed ledger records are unavailable; ledger state is NOT VERIFIED.</p>}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-display text-lg font-semibold">Invoices</h3>
              <p className="text-xs text-muted">Existing service invoices only. This view does not issue, void or mark invoices paid.</p>
            </div>
            {invoices?.status === "AVAILABLE" ? (
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                      <tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Subtotal</th><th className="px-4 py-3">Tax</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Issued / paid</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {invoices.rows.map((row) => (
                        <tr key={row.reference}>
                          <td className="px-4 py-3"><p className="font-medium">{row.invoiceNumber}</p><p className="mt-1 font-mono text-[10px] text-muted">{row.reference}</p></td>
                          <td className="px-4 py-3">{row.status}</td>
                          <td className="px-4 py-3 tabular-nums">{formatMoney(row.subtotalPaise, row.currency)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatMoney(row.taxPaise, row.currency)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatMoney(row.totalPaise, row.currency)}</td>
                          <td className="px-4 py-3 text-xs text-muted"><p>{formatDate(row.issuedAt)}</p><p className="mt-1">Paid: {row.paidAt ? formatDate(row.paidAt) : "—"}</p></td>
                        </tr>
                      ))}
                      {!invoices.rows.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No invoice rows were returned.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-line p-5 text-sm text-muted">Invoice records are unavailable; invoice state is NOT VERIFIED.</p>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-display text-lg font-semibold">Accounting ledger summary</h3>
              <p className="text-xs text-muted">Recorded ledger rows grouped by currency, entry type and classification. No reconciliation or journal posting occurs here.</p>
            </div>
            {ledger?.status === "AVAILABLE" ? (
              ledger.groups.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {ledger.groups.map((row) => (
                    <article key={row.currency + row.entryType + row.classification} className="rounded-xl border border-line bg-surface p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{row.entryType.replaceAll("_", " ")} · {row.classification} · {row.currency}</p>
                      <p className="mt-2 text-xl font-semibold tabular-nums">{formatMoney(row.totalAmountPaise, row.currency)}</p>
                      <p className="mt-1 text-xs text-muted">{row.count.toLocaleString("en-IN")} entries</p>
                    </article>
                  ))}
                </div>
              ) : <p className="rounded-xl border border-line p-5 text-sm text-muted">No ledger entries were returned.</p>
            ) : <p className="rounded-xl border border-line p-5 text-sm text-muted">Ledger records are unavailable; accounting ledger state is NOT VERIFIED.</p>}
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <h3 className="font-semibold">Recent payment records</h3>
              <p className="mt-1 text-xs text-muted">Latest 25 records. Buyer identity and personal contact details are intentionally excluded.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3">Title / reference</th>
                    <th className="px-4 py-3">Purpose</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Created / verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recent.map((row) => (
                    <tr key={row.reference}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.titleName ?? "Service / non-title payment"}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted">{row.reference}</p>
                      </td>
                      <td className="px-4 py-3">{row.purpose.replaceAll("_", " ")}</td>
                      <td className="px-4 py-3">{row.provider}</td>
                      <td className="px-4 py-3"><span className="rounded-full border border-line px-2 py-1 text-[10px] text-muted">{row.status.replaceAll("_", " ")}</span></td>
                      <td className="px-4 py-3 tabular-nums">{formatMoney(row.amountPaise, row.currency)}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <p>{formatDate(row.createdAt)}</p>
                        <p className="mt-1">Verified: {row.verifiedAt ? formatDate(row.verifiedAt) : "—"}</p>
                      </td>
                    </tr>
                  ))}
                  {!recent.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No recent payment records.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Financial control boundaries</h3>
        <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>• Payment oversight does not grant Buyer checkout or order-creation privileges.</li>
          <li>• This page cannot verify, capture, refund or reverse a payment.</li>
          <li>• Customer entitlements remain separate from internal staff permissions.</li>
          <li>• Invoices are created by the existing captured-service-payment flow; this page only reads issued records. Manual invoice corrections, bank statement matching, journal posting and period close remain separate controls.</li>
          <li>• No Razorpay API calls or live transactions are made by this page.</li>
          <li>• All data is fetched server-side after verified Super Admin authorization.</li>
        </ul>
      </section>
    </div>
  );
}

function formatMoney(amountPaise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 })
    .format(amountPaise / 100);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN");
}
