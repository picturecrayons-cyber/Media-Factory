import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listSuperAdminInvestorGovernance } from "@/lib/bridge/super-admin-investor";

export const Route = createFileRoute("/investor-governance")({ component: InvestorGovernance });

function InvestorGovernance() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Investor governance">
          <InvestorGovernanceBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InvestorGovernanceBody() {
  const query = useQuery({
    queryKey: ["super-admin-investor-governance"],
    queryFn: () => listSuperAdminInvestorGovernance(),
    retry: false,
  });
  const summary = query.data?.summary;
  const records = query.data?.records ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Governance · read only</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Investor-to-title mapping</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Existing Bridge title-investor records and optional account links. This view does not create assignments, change participation, approve returns or move money.
        </p>
      </section>

      {query.isPending ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading investor mapping…</p>
      ) : query.isError ? (
        <p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">
          Investor mapping is unavailable. No empty or zero portfolio state is inferred from a failed data source.
        </p>
      ) : (
        <>
          {summary ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Titles with records" value={summary.titleCount.toLocaleString("en-IN")} />
              <Metric label="Investor records" value={summary.recordCount.toLocaleString("en-IN")} />
              <Metric label="Linked accounts" value={summary.linkedCount.toLocaleString("en-IN")} />
              <Metric label="Unlinked records" value={summary.unlinkedCount.toLocaleString("en-IN")} />
              
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <h3 className="font-semibold">Investor allocation records</h3>
              <p className="mt-1 text-xs text-muted">Latest {query.data?.limit ?? 200} records at most. Account emails and private notes are not exposed.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Investor</th>
                    <th className="px-4 py-3">Account link</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Recorded capital</th>
                    <th className="px-4 py-3">Participation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {records.map((row) => (
                    <tr key={row.reference}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.titleName}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted">{row.titleId}</p>
                      </td>
                      <td className="px-4 py-3">{row.investorName}</td>
                      <td className="px-4 py-3">{row.linked ? row.linkedDisplayName ?? "Linked account" : "Unlinked record"}</td>
                      <td className="px-4 py-3 text-xs text-muted">{row.investmentReference ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{row.investedAmountPaise == null ? "Not recorded" : formatMoney(row.investedAmountPaise, row.currency)}</td>
                      <td className="px-4 py-3 tabular-nums">{row.participationPercent == null ? "Not recorded" : `${row.participationPercent.toFixed(2)}%`}</td>
                    </tr>
                  ))}
                  {!records.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No investor allocation records are currently available.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Governance boundaries</h3>
        <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>• Investor account entitlements remain separate from staff roles.</li>
          <li>• This page does not verify legal agreements, bank receipts or beneficial ownership.</li>
          <li>• Settlement, distribution and payout approval remain separate finance controls.</li>
          <li>• No account linking, investor invitation or allocation mutation is available here.</li>
        </ul>
      </section>
    </div>
  );
}

function formatMoney(paise: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(paise / 100);
  } catch {
    return `${currency} ${(paise / 100).toLocaleString("en-IN")}`;
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}

