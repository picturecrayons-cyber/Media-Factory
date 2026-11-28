import { useQuery } from "@tanstack/react-query";
import { getLoopTitleAnalytics } from "@/lib/bridge/loop-analytics";

type AnalyticsRow = {
  bridge_title_id: string;
  title_name: string;
  lifecycle_status: string;
  publication_status: string | null;
  loop_title_status: string | null;
  listed: boolean | null;
  published: boolean | null;
  unique_viewers: number | string;
  completed_viewers: number | string;
  watch_seconds: number | string;
  average_completion_pct: number | string | null;
  active_rentals: number | string;
  active_purchases: number | string;
  fulfilled_payment_events: number | string;
  refunded_payment_events: number | string;
};

function count(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + (/^[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"';
}

export function LoopTitleAnalytics({ title = "Loop performance & owner report" }: { title?: string }) {
  const query = useQuery({
    queryKey: ["bridge-loop-title-analytics"],
    queryFn: () => getLoopTitleAnalytics(),
    retry: 1,
  });
  const rows = (query.data?.rows ?? []) as AnalyticsRow[];

  function exportCsv() {
    const headings = ["Bridge title ID","Title","Bridge lifecycle","Bridge publication","Loop status","Listed","Published","Unique viewers (latest progress)","Completed viewers","Watch seconds (latest progress sum)","Average completion %","Active rentals","Active purchases","Fulfilled payment events","Refunded payment events"];
    const values = rows.map((row) => [
      row.bridge_title_id,row.title_name,row.lifecycle_status,row.publication_status ?? "Not published",
      row.loop_title_status ?? "Not linked",row.listed ?? false,row.published ?? false,
      count(row.unique_viewers),count(row.completed_viewers),count(row.watch_seconds),
      row.average_completion_pct == null ? "" : count(row.average_completion_pct),
      count(row.active_rentals),count(row.active_purchases),
      count(row.fulfilled_payment_events),count(row.refunded_payment_events),
    ]);
    const blob = new Blob([[headings,...values].map(line=>line.map(csvCell).join(",")).join("\\n")],{type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href=url;
    link.download="crayons-loop-title-analytics.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Crayons Loop · verified read model</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">Title-scoped viewing and TVOD activity from the shared Loop database. Creator and Studio accounts see only their own authorized titles; Super Admin sees the portfolio.</p>
        </div>
        <button type="button" disabled={!rows.length || query.isPending || query.isError} onClick={exportCsv} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button>
      </div>
      {query.isPending ? <p className="text-sm text-muted">Loading Loop report…</p> : null}
      {query.isError ? <div role="alert" className="rounded-lg border border-line p-4 text-sm"><p>Loop analytics are unavailable. No zero totals are assumed.</p><button type="button" className="mt-2 font-semibold text-accent underline" onClick={()=>void query.refetch()}>Retry</button></div> : null}
      {query.isSuccess && rows.length === 0 ? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No Bridge-owned title has a linked Loop publication record yet.</p> : null}
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-2">Title</th><th className="p-2">Loop</th><th className="p-2">Viewers</th><th className="p-2">Completed</th><th className="p-2">Watch time</th><th className="p-2">Rentals</th><th className="p-2">Purchases</th><th className="p-2">Payment events</th></tr></thead>
        <tbody className="divide-y divide-line">{rows.map(row=><tr key={row.bridge_title_id}>
          <td className="p-2"><div className="font-medium">{row.title_name}</div><div className="text-xs text-muted">{row.lifecycle_status.replaceAll("_"," ")}</div></td>
          <td className="p-2">{row.publication_status ?? "Not linked"}<div className="text-xs text-muted">{row.published ? "Published" : "Not public"}</div></td>
          <td className="p-2 tabular-nums">{count(row.unique_viewers)}</td>
          <td className="p-2 tabular-nums">{count(row.completed_viewers)}</td>
          <td className="p-2 tabular-nums">{(count(row.watch_seconds)/3600).toFixed(1)} h</td>
          <td className="p-2 tabular-nums">{count(row.active_rentals)}</td>
          <td className="p-2 tabular-nums">{count(row.active_purchases)}</td>
          <td className="p-2 tabular-nums">{count(row.fulfilled_payment_events)} / {count(row.refunded_payment_events)} refunded</td>
        </tr>)}</tbody>
      </table></div> : null}
      <p className="text-xs text-muted">Important: watch progress is one latest-progress row per viewer/title, not play-start analytics. Payment-event counts are not captured-amount, net-revenue, commission, payable or settlement reports. Those require provider reconciliation and the Bridge settlement ledger.</p>
      {query.data?.generatedAt ? <p className="text-xs text-muted">Report generated {new Date(query.data.generatedAt).toLocaleString()}</p> : null}
    </section>
  );
}
