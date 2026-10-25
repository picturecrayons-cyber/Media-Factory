import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/super-admin/buyers")({ component: BuyerDeskRoute });

type Buyer = { id: number; display_name: string; user_type: string; last_login: string | null; active_mappings: number };
type Activity = {
  buyer_id: number; film_id: number; is_active: boolean; allow_download: boolean;
  download_requested: boolean; film_info_requested: boolean; trailer_download_requested: boolean;
  notes: string | null; payment_status: string | null; payment_amount: string | null;
  currency: string | null; watch_count: number; last_watched_at: string | null; workflow: string[];
};

async function getPrivateJson<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to access the super-admin buyer desk.");
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    if (response.status === 403) throw new Error("Super admin access required (403).");
    throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Buyer desk request failed.");
  }
  return response.json() as Promise<T>;
}

function BuyerDeskRoute() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Buyer Desk & Licensing">
          <BuyerDesk />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerDesk() {
  const buyersQ = useQuery({
    queryKey: ["super-admin-buyer-desk-buyers"],
    queryFn: () => getPrivateJson<{ buyers: Buyer[] }>("/api/bridge/super-admin/buyers"),
  });
  const activityQ = useQuery({
    queryKey: ["super-admin-buyer-desk-activity", 7],
    queryFn: () => getPrivateJson<{ activity: Activity[] }>("/api/bridge/super-admin/buyer-activity?film_id=7"),
  });
  const buyers = buyersQ.data?.buyers ?? [];
  const activity = activityQ.data?.activity ?? [];
  const byId = new Map(buyers.map((buyer) => [buyer.id, buyer]));

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Private control plane · Super Admin</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Buyer Desk & Licensing</h2>
        <p className="mt-2 text-sm text-muted">Jananam 1947 · film ID 7. Buyer contact emails are intentionally not returned by the API.</p>
        <p role="status" className="mt-3 rounded border border-line px-3 py-2 text-sm text-muted">Preview-safe review mode. Rights, payment records, and OCI delivery permissions are not changed from this screen.</p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Buyers</h3>
          <span className="text-sm text-muted">{buyers.length} buyer accounts</span>
        </div>
        {buyersQ.isPending ? <p className="py-4 text-sm text-muted">Loading buyer accounts…</p> : null}
        {buyersQ.isError ? <p role="alert" className="py-4 text-sm text-accent">{buyersQ.error.message}</p> : null}
        {!buyersQ.isPending && !buyersQ.isError ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-2 py-3">Buyer</th><th className="px-2 py-3">Account type</th><th className="px-2 py-3">Last login</th><th className="px-2 py-3">Active mappings</th></tr></thead>
              <tbody className="divide-y divide-line">
                {buyers.map((buyer) => <tr key={buyer.id}><td className="px-2 py-3 font-medium">{buyer.display_name}</td><td className="px-2 py-3">{buyer.user_type}</td><td className="px-2 py-3 text-muted">{buyer.last_login ? new Date(buyer.last_login).toLocaleString() : "Not recorded"}</td><td className="px-2 py-3 tabular-nums">{buyer.active_mappings}</td></tr>)}
                {!buyers.length ? <tr><td colSpan={4} className="px-2 py-6 text-center text-muted">No buyer accounts found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Jananam 1947 · Rights & activity</h3><span className="text-sm text-muted">{activity.length} mappings</span></div>
        {activityQ.isPending ? <p className="py-4 text-sm text-muted">Loading licensing activity…</p> : null}
        {activityQ.isError ? <p role="alert" className="py-4 text-sm text-accent">{activityQ.error.message}</p> : null}
        {!activityQ.isPending && !activityQ.isError ? (
          <div className="mt-3 space-y-3">
            {activity.map((item) => {
              const buyer = byId.get(item.buyer_id);
              return <article key={`${item.buyer_id}-${item.film_id}`} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h4 className="font-medium">{buyer?.display_name ?? `Buyer #${item.buyer_id}`}</h4><p className="mt-1 text-xs text-muted">Film #{item.film_id} · {item.is_active ? "Active mapping" : "Inactive mapping"}</p></div>
                  <span className="rounded border border-line px-2 py-1 text-xs">{item.payment_status === "success" ? "Payment success" : item.payment_status === "pending" ? "Payment pending" : "No payment status"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">{item.workflow.map((stage) => <span key={stage} className="rounded-full border border-line px-2 py-1 text-xs">{stage}</span>)}</div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-xs text-muted">Rights notes</dt><dd className="mt-1 whitespace-pre-wrap">{item.notes || "No notes recorded"}</dd></div>
                  <div><dt className="text-xs text-muted">Requests</dt><dd className="mt-1">Download: {item.download_requested ? "Requested" : "—"} · Film info: {item.film_info_requested ? "Requested" : "—"} · Trailer: {item.trailer_download_requested ? "Requested" : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Permission / usage</dt><dd className="mt-1">allow_download: {item.allow_download ? "Allowed in record" : "Not allowed"} · Watches: {item.watch_count} · Last watched: {item.last_watched_at ? new Date(item.last_watched_at).toLocaleString() : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Payment amount</dt><dd className="mt-1">{item.payment_amount && item.currency ? `${item.currency} ${item.payment_amount}` : "Not recorded"}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <label className="inline-flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={item.allow_download} readOnly disabled aria-label={`Download allowance for buyer ${item.buyer_id}`} /> allow_download</label>
                  <span className="text-xs text-muted">Read-only display; no permission toggle is wired until audited server-side mutation and OCI lifecycle checks are implemented.</span>
                </div>
              </article>;
            })}
            {!activity.length ? <p className="py-6 text-center text-sm text-muted">No buyer mappings found for Jananam 1947 (film ID 7).</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
