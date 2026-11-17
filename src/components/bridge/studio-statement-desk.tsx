import { useQuery } from "@tanstack/react-query";
import { listStudioStatements } from "@/lib/bridge/studio-statements";

function formatMinor(amount: number | null, currency: string) {
  if (amount === null) return "Not reported";
  if (currency === "INR") {
    return `₹${(amount / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return `${amount.toLocaleString("en-IN")} ${currency} minor units`;
}

export function StudioStatementDesk() {
  const query = useQuery({
    queryKey: ["bridge-studio-statements"],
    queryFn: () => listStudioStatements(),
    retry: 1,
  });

  if (query.isPending) return <p className="text-sm text-muted">Loading verified Studio statements…</p>;
  if (query.isError) {
    return (
      <div role="alert" className="rounded-sm border border-line p-4 text-sm">
        <p>Statements are unavailable or this account lacks Studio owner/admin access. No financial value has been estimated.</p>
        <button type="button" className="mt-2 font-semibold text-accent underline" onClick={() => void query.refetch()}>Retry</button>
      </div>
    );
  }
  if (!query.data.statements.length) {
    return <p className="text-sm text-muted">No channel statement lines are recorded for this Studio organization.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-3 py-2">Title / channel</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Statement status</th>
              <th className="px-3 py-2">Reported gross</th>
              <th className="px-3 py-2">Adjustments</th>
              <th className="px-3 py-2">Net reported</th>
              <th className="px-3 py-2">Payment record</th>
            </tr>
          </thead>
          <tbody>
            {query.data.statements.map((statement) => (
              <tr key={statement.id} className="border-b border-line/70 align-top">
                <td className="px-3 py-3">
                  <p className="font-medium">{statement.titleName}</p>
                  <p className="text-xs text-muted">{statement.channelName} · {statement.channelCode}</p>
                  {statement.statementReference ? <p className="text-xs text-muted">Ref: {statement.statementReference}</p> : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{statement.periodStart} – {statement.periodEnd}</td>
                <td className="px-3 py-3">
                  <p className="font-medium">{statement.statementStatus}</p>
                  {statement.reconciledAt ? <p className="text-xs text-muted">Reconciled {new Date(statement.reconciledAt).toLocaleDateString("en-IN")}</p> : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {statement.reportedGrossMinor === null ? formatMinor(statement.estimateAmountMinor, statement.currency) : formatMinor(statement.reportedGrossMinor, statement.currency)}
                  {statement.reportedGrossMinor === null && statement.estimateAmountMinor !== null ? <p className="text-xs text-muted">Estimate only</p> : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{formatMinor(statement.adjustmentsMinor, statement.currency)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatMinor(statement.netAmountMinor, statement.currency)}</td>
                <td className="px-3 py-3">
                  <p>{statement.paymentStatus ?? "No payment schedule"}</p>
                  {statement.paymentDueAt ? <p className="text-xs text-muted">Due {statement.paymentDueAt}</p> : null}
                  {statement.paymentPostedAt ? <p className="text-xs text-muted">Posted {new Date(statement.paymentPostedAt).toLocaleDateString("en-IN")}</p> : null}
                  {statement.paymentStatus === "PAID" ? <p className="text-xs text-muted">Recorded paid: {formatMinor(statement.paidAmountMinor, statement.currency)}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-muted">
        Read-only source statements. Estimated, reported and reconciled statuses remain distinct. A payment schedule marked PAID is a recorded ledger status, not independent bank confirmation or proof of cash settlement.
      </p>
    </div>
  );
}
