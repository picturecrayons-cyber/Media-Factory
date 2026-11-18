import { useQuery } from "@tanstack/react-query";
import { listOwnCreatorStatements } from "@/lib/bridge/creator-statements";
import { formatCreatorStatementAmount, sumCreatorStatementAmounts } from "@/lib/bridge/creator-statement-format";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function CreatorStatementDesk() {
  const query = useQuery({
    queryKey: ["bridge-creator-own-statements"],
    queryFn: () => listOwnCreatorStatements(),
    retry: 1,
  });

  if (query.isPending) return <p className="mt-4 text-sm text-muted">Loading verified creator-payable records…</p>;
  if (query.isError) {
    return (
      <div role="alert" className="mt-4 rounded-xl border border-line p-4 text-sm">
        <p>Creator statements are unavailable. No earnings have been estimated.</p>
        <button type="button" className="mt-2 font-semibold text-accent underline" onClick={() => void query.refetch()}>Retry</button>
      </div>
    );
  }

  const lines = query.data.statements;
  const paid = lines.filter((line) => line.status === "PAID");
  const pending = lines.filter((line) => line.status === "PENDING" || line.status === "ON_HOLD");
  const approved = lines.filter((line) => line.status === "APPROVED");
  const payableTotals = sumCreatorStatementAmounts(lines);
  const paidTotals = sumCreatorStatementAmounts(paid);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {payableTotals.length ? payableTotals.map((total) => (
          <Metric key={`payable-${total.currency}`} label={`Recorded payable · ${total.currency}`} value={formatCreatorStatementAmount(total.amountMinor, total.currency)} note="Explicit Creator settlement allocations only" />
        )) : <Metric label="Recorded payable" value="No allocation recorded" note="No amount inferred from title or licensing values" />}
        {paidTotals.map((total) => (
          <Metric key={`paid-${total.currency}`} label={`Paid status · ${total.currency}`} value={formatCreatorStatementAmount(total.amountMinor, total.currency)} note={`${paid.length} records marked PAID across currencies`} />
        ))}
        <Metric label="Awaiting action" value={String(pending.length + approved.length)} note="Pending, on-hold or approved records" />
      </div>

      {!lines.length ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          No Creator-payable settlement lines are recorded for this account yet. This is not a zero-income certification; no statement allocation has been recorded.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs text-muted">
              <th className="px-3 py-2">Title</th><th className="px-3 py-2">Basis</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Recorded</th><th className="px-3 py-2">Paid date</th>
            </tr></thead>
            <tbody>{lines.map((line) => (
              <tr key={line.id} className="border-b border-line/70">
                <td className="px-3 py-3"><p className="font-medium">{line.titleName}</p><p className="text-xs text-muted">{line.titleId}</p></td>
                <td className="px-3 py-3">{line.basis}{line.percentageBps === null ? "" : ` · ${(line.percentageBps / 100).toFixed(2)}%`}</td>
                <td className="px-3 py-3 whitespace-nowrap font-medium">{formatCreatorStatementAmount(line.amountPaise, line.currency)}</td>
                <td className="px-3 py-3">{line.status}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDate(line.createdAt)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{line.paidAt ? formatDate(line.paidAt) : "Not recorded"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="text-xs leading-5 text-muted">
        Read-only allocation records from the Bridge settlement ledger. PAID is an application status and timestamp, not independent bank confirmation. Currency totals are never combined. No title licensing fee is treated as Creator income; bank reconciliation and tax/accounting certification are separate controls.
      </p>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rounded-xl border border-line bg-bg/60 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 font-display text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></article>;
}
