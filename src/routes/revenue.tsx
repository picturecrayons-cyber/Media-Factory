import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getRevenueDashboard } from "@/lib/bridge/revenue";

export const Route = createFileRoute("/revenue")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: RevenuePage,
});

type RevenueLine = Awaited<ReturnType<typeof getRevenueDashboard>>["lines"][number];

function money(value: number | null, currency: string) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function date(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function totalByCurrency(lines: RevenueLine[], select: (line: RevenueLine) => number | null) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const value = select(line);
    if (value == null) continue;
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + value);
  }
  return [...totals.entries()];
}

function RevenuePage() {
  return (
    <RequireBridge allow="workspace">
      {(actor) => (
        <BridgeShell actor={actor} title="Revenue & Distribution">
          <RevenueBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function RevenueBody() {
  const query = useQuery({
    queryKey: ["bridge-revenue-dashboard"],
    queryFn: () => getRevenueDashboard(),
    retry: false,
  });
  const lines = query.data?.lines ?? [];
  const estimates = totalByCurrency(lines, (line) => line.estimateAmountMinor);
  const reported = totalByCurrency(lines, (line) => line.netAmountMinor);
  const paid = totalByCurrency(lines, (line) => line.paidAmountMinor);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 pb-16 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Studio & Creator workspace</p>
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Revenue & Distribution Intelligence</h1>
        <p className="max-w-2xl text-sm text-muted">
          Follow title-level channel estimates, statements and expected payment dates. Estimates are indicative;
          only reconciled statements and confirmed settlements count as earnings and payments.
        </p>
      </header>

      {query.isPending ? (
        <div className="rounded-xl border border-line p-6 text-sm text-muted">Loading your revenue records…</div>
      ) : query.isError ? (
        <section role="alert" className="rounded-xl border border-line p-6">
          <h2 className="font-semibold">Revenue records are unavailable</h2>
          <p className="mt-2 text-sm text-muted">
            No financial status has been inferred. The revenue statement tables may not yet be installed in this environment.
          </p>
          <button className="mt-4 text-sm font-semibold underline" onClick={() => void query.refetch()}>Retry</button>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Metric title="Gross estimates" values={estimates} note="Indicative only · not payable" />
            <Metric title="Reported net earnings" values={reported} note="From channel statements" />
            <Metric title="Payments recorded" values={paid} note="Confirmed settlement amounts only" />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">Payment schedule</h2>
                <p className="text-sm text-muted">Expected and posted payments by title and distribution channel.</p>
              </div>
              <span className="text-xs text-muted">{lines.length} statement line{lines.length === 1 ? "" : "s"}</span>
            </div>
            {lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-8 text-center">
                <h3 className="font-semibold">No channel statements yet</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
                  Once Finance records a channel statement and its payment terms, title-level estimates, reporting periods
                  and expected payment dates will appear here. No sample earnings are displayed.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-surface-secondary text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3">Title / Channel</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Estimate</th>
                      <th className="px-4 py-3">Reported net</th>
                      <th className="px-4 py-3">Payment expected</th>
                      <th className="px-4 py-3">Payment posted</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {lines.map((line) => <RevenueRow key={line.id} line={line} />)}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-line p-5">
            <h2 className="font-semibold">Accounting definitions</h2>
            <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="font-medium">Estimate</dt><dd className="mt-1 text-muted">Early channel performance figure. It can change and is never treated as payment.</dd></div>
              <div><dt className="font-medium">Reported net</dt><dd className="mt-1 text-muted">Channel gross less recorded adjustments, as shown on the received statement.</dd></div>
              <div><dt className="font-medium">Paid</dt><dd className="mt-1 text-muted">Settlement amount recorded with payment evidence. A due date alone is not a payment.</dd></div>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ title, values, note }: { title: string; values: [string, number][]; note: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-5">
      <p className="text-sm text-muted">{title}</p>
      <div className="mt-3 space-y-1">
        {values.length ? values.map(([currency, value]) => (
          <p key={currency} className="text-2xl font-semibold tabular-nums">{money(value, currency)}</p>
        )) : <p className="text-2xl font-semibold text-muted">—</p>}
      </div>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </article>
  );
}

function RevenueRow({ line }: { line: RevenueLine }) {
  const status = line.paymentStatus ?? line.statementStatus;
  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium">{line.titleName}</p>
        <p className="mt-1 text-xs text-muted">{line.channelName}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">{date(line.periodStart)} – {date(line.periodEnd)}</td>
      <td className="px-4 py-3 whitespace-nowrap">{money(line.estimateAmountMinor, line.currency)}</td>
      <td className="px-4 py-3 whitespace-nowrap">{money(line.netAmountMinor, line.currency)}</td>
      <td className="px-4 py-3 whitespace-nowrap">{date(line.paymentDueAt)}</td>
      <td className="px-4 py-3 whitespace-nowrap">{line.paymentPostedAt ? date(line.paymentPostedAt) : "—"}</td>
      <td className="px-4 py-3">
        <span className="rounded-full border border-line px-2.5 py-1 text-xs">{status.replaceAll("_", " ")}</span>
      </td>
    </tr>
  );
}
