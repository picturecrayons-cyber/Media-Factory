import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listInvestorInvestments, listInvestorTitleAccess } from "@/lib/bridge/investor";

export const Route = createFileRoute("/investor")({ component: Investor });

function Investor() {
  return (
    <RequireBridge allow="investor">
      {(actor) => (
        <BridgeShell actor={actor} title="Investor Home">
          <InvestorHome userId={actor.userId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InvestorHome({ userId }: { userId: string }) {
  const investmentsQ = useQuery({
    queryKey: ["bridge-investor-investments", userId],
    queryFn: () => listInvestorInvestments(),
    retry: 1,
  });
  const accessQ = useQuery({ queryKey: ["bridge-investor-title-access", userId], queryFn: () => listInvestorTitleAccess(), retry: 1 });
  const assigned = accessQ.data?.titles ?? [];
  const rows = investmentsQ.data?.investments ?? [];
  const totalCapitalPaise = rows.reduce((sum, row) => sum + Number(row.investedAmountPaise ?? 0), 0);
  const assignedTitles = new Set([...rows.map((row) => row.titleId), ...assigned.map((row) => row.titleId)]).size;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Investor workspace</p>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Your investment portfolio</h2>
          <p className="mt-1 text-sm text-muted">View only the investment records assigned to your account.</p>
        </div>
        <Link to="/account" className="text-sm font-semibold text-accent hover:underline">Account & access →</Link>
      </header>

      {investmentsQ.isPending ? <p role="status" className="text-sm text-muted">Loading your assigned investment records…</p> : null}
      {investmentsQ.isError ? (
        <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          <p>Your portfolio could not be loaded. Totals are hidden until the authenticated data source responds.</p>
          <button type="button" onClick={() => void investmentsQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
        </div>
      ) : null}

      {!investmentsQ.isPending && !investmentsQ.isError ? (
        <>
          <section aria-label="Portfolio overview" className="grid gap-3 sm:grid-cols-3">
            <Metric label="Investment records" value={String(rows.length)} />
            <Metric label="Assigned titles" value={String(assignedTitles)} />
            <Metric label="Recorded capital" value={`₹${(totalCapitalPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} />
          </section>

          <section className="space-y-3">
            <div><h3 className="font-display text-lg font-semibold">Titles assigned by Bridge</h3><p className="text-sm text-muted">Read-only title access granted by Super Admin. This is not an investment or financial commitment.</p></div>
            {accessQ.isPending ? <p className="text-sm text-muted">Loading assigned titles…</p> : accessQ.isError ? <p role="alert" className="text-sm text-muted">Assigned titles could not be loaded.</p> : assigned.length ? <div className="grid gap-3 sm:grid-cols-2">{assigned.map((title:any)=><article key={title.titleId} className="rounded-xl border border-line bg-surface p-4"><p className="font-medium">{title.titleName}</p><p className="mt-1 text-xs text-muted">{title.submissionType === "story_concept" ? "Story / Concept" : "Finished Film"} · {title.status}</p><Link to="/title/$id" params={{id:title.titleId}} className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">Open assigned title →</Link></article>)}</div> : <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">No titles have been assigned to this Investor account.</p>}
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">My investments</h3>
                <p className="text-sm text-muted">Recorded participation details. No unassigned opportunities are displayed.</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Capital</th>
                    <th className="px-4 py-3">Participation</th>
                    <th className="px-4 py-3">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3"><Link to="/title/$id" params={{ id: row.titleId }} className="font-medium hover:text-accent">{row.titleName}</Link></td>
                      <td className="px-4 py-3">{row.investmentReference ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">₹{(Number(row.investedAmountPaise ?? 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 tabular-nums">{Number(row.participationPercent ?? 0).toFixed(2)}%</td>
                      <td className="px-4 py-3">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                  {!rows.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No investment records are assigned to this account yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
      <p className="border-t border-line pt-4 text-xs text-muted">Investor access is read-only and limited to assigned investment records. Participation terms and financial records are not editable from this dashboard.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}
