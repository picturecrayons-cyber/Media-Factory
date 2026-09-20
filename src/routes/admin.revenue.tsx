import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { listRevenue, platformOverview } from "@/lib/cinema";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/revenue")({ component: AdminRevenue });

function AdminRevenue() {
  const { user, isPending } = useCurrentUserState();
  const o = useQuery({ queryKey: ["overview"], queryFn: () => platformOverview(), enabled: !!user });
  const r = useQuery({ queryKey: ["revenue"], queryFn: () => listRevenue(), enabled: !!user });
  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;

  return (
    <AdminShell>
      <p className="text-[11px] tracking-[0.22em] text-loop uppercase">CC 09 · Revenue & settlements</p>
      <h1 className="font-display mt-1 text-3xl tracking-wide">360° Revenue & Ads</h1>
      <p className="mt-2 text-sm text-muted">65/35 studio waterfall · byte-for-byte ledger.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-elevated p-4">
          <p className="text-[11px] text-muted uppercase">Transactions</p>
          <p className="mt-2 font-display text-2xl">{o.data?.txCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-line bg-elevated p-4">
          <p className="text-[11px] text-muted uppercase">Gross INR</p>
          <p className="mt-2 font-display text-2xl">₹{o.data?.txSum ?? 0}</p>
        </div>
        <div className="rounded-lg border border-line bg-elevated p-4">
          <p className="text-[11px] text-muted uppercase">Active subs</p>
          <p className="mt-2 font-display text-2xl">{o.data?.activeSubs ?? 0}</p>
        </div>
      </div>
      <table className="mt-8 w-full text-left text-sm">
        <thead className="text-[11px] tracking-wide text-muted uppercase">
          <tr>
            <th className="pb-2 font-medium">When</th>
            <th className="pb-2 font-medium">Kind</th>
            <th className="pb-2 font-medium">Title</th>
            <th className="pb-2 font-medium">INR</th>
          </tr>
        </thead>
        <tbody>
          {(r.data ?? []).map((row) => (
            <tr key={row.id} className="border-t border-line">
              <td className="py-2 text-muted">{new Date(row.created_at).toLocaleString()}</td>
              <td>{row.kind}</td>
              <td className="text-muted">{row.title_id ?? "—"}</td>
              <td>₹{row.amount_inr}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!(r.data ?? []).length ? (
        <p className="mt-8 text-sm text-muted">No records. Awaiting production checkout — run a pass or TVOD from the public app.</p>
      ) : null}
    </AdminShell>
  );
}
