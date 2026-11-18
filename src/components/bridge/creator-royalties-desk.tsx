import { useQuery } from "@tanstack/react-query";
import { listCreatorRoyalties } from "@/lib/bridge/creator-royalties";

import { formatCreatorMinorAmount, formatCreatorRoyaltyDate } from "@/lib/bridge/creator-royalties-format";

export function CreatorRoyaltiesDesk({ actorUserId }: { actorUserId: string }) {
  const query = useQuery({
    queryKey: ["bridge-creator-royalties", actorUserId],
    queryFn: () => listCreatorRoyalties(),
    retry: 1,
  });

  if (query.isPending) return <p className="text-sm text-muted">Loading creator royalty records…</p>;
  if (query.isError) {
    return (
      <div role="alert" className="rounded-xl border border-line p-4 text-sm">
        <p>Royalty records are unavailable. No amount has been estimated or inferred.</p>
        <button type="button" className="mt-2 font-semibold text-accent underline" onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  if (!query.data.records.length) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No creator-payable settlement records are currently recorded for your titles.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Recorded revenue</th>
              <th className="px-3 py-2">Creator payable</th>
              <th className="px-3 py-2">Ledger status</th>
              <th className="px-3 py-2">Evidence</th>
              <th className="px-3 py-2">Recorded / settled</th>
            </tr>
          </thead>
          <tbody>
            {query.data.records.map((record) => (
              <tr key={record.id} className="border-b border-line/70 align-top">
                <td className="px-3 py-3">
                  <p className="font-medium">{record.titleName}</p>
                  <p className="text-xs text-muted">{record.titleId}</p>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{formatCreatorMinorAmount(record.revenueReceivedMinor, record.currency)}</td>
                <td className="px-3 py-3 whitespace-nowrap font-medium">{formatCreatorMinorAmount(record.creatorPayableMinor, record.currency)}</td>
                <td className="px-3 py-3">{record.status.replaceAll("_", " ")}</td>
                <td className="px-3 py-3">{record.evidenceCount === null ? "Not structured" : `${record.evidenceCount} reference(s)`}</td>
                <td className="px-3 py-3 whitespace-nowrap text-xs">
                  <p>Recorded: {formatCreatorRoyaltyDate(record.recordedAt)}</p>
                  <p className="mt-1 text-muted">Settled: {formatCreatorRoyaltyDate(record.settledAt)}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-muted">
        Read-only records from Bridge title settlements, scoped to titles owned by this Creator account. “Creator payable” and “SETTLED” are application ledger values, not independent bank confirmation. No royalty amount is calculated from licensing fees or title status.
      </p>
    </div>
  );
}
