import { useQuery } from "@tanstack/react-query";
import { listStudioFinancialActivity } from "@/lib/bridge/studio-statements";
import { formatStudioMinorAmount } from "@/lib/bridge/studio-statement-format";

export function StudioFinancialActivityDesk() {
  const query = useQuery({
    queryKey: ["bridge-studio-financial-activity"],
    queryFn: () => listStudioFinancialActivity(),
    retry: 1,
  });

  if (query.isPending) {
    return <p className="text-sm text-muted">Loading Studio commercial activity…</p>;
  }
  if (query.isError) {
    return (
      <div role="alert" className="rounded-sm border border-line p-4 text-sm">
        <p>Commercial activity is unavailable or this account lacks Studio owner/admin access. No financial value has been estimated.</p>
        <button type="button" className="mt-2 font-semibold text-accent underline" onClick={() => void query.refetch()}>Retry</button>
      </div>
    );
  }
  if (!query.data.activity.length) {
    return <p className="text-sm text-muted">No payment, financial-ledger or service-settlement records are currently linked to this Studio’s titles.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Source / category</th>
              <th className="px-3 py-2">Record status</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {query.data.activity.map((item) => (
              <tr key={item.source + ":" + item.id} className="border-b border-line/70 align-top">
                <td className="px-3 py-3 font-medium">{item.titleName}</td>
                <td className="px-3 py-3">
                  <p>{item.source.replaceAll("_", " ")}</p>
                  <p className="text-xs text-muted">{item.category}</p>
                </td>
                <td className="px-3 py-3">{item.status}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatStudioMinorAmount(item.amountMinor, item.currency)}</td>
                <td className="px-3 py-3 text-xs">{item.reference ?? "Not recorded"}</td>
                <td className="px-3 py-3 whitespace-nowrap text-xs">
                  {item.occurredAt ? new Date(item.occurredAt).toLocaleString("en-IN") : "Not recorded"}
                  <p className="mt-1 max-w-xs whitespace-normal text-muted">{item.note}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-muted">
        Read-only records from the existing payment, server-side ledger and contractual settlement tables. These are operational source records, not audited accounts. Provider capture, ledger posting, a settlement status or a paid_at timestamp is not independent bank confirmation. Bank statement matching, discrepancy resolution, dual approval and accounting certification are not connected here.
      </p>
    </div>
  );
}
