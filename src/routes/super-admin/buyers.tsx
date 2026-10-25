import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { supabase } from "@/lib/supabase";

const JANANAM_TITLE_ID = "title-jananam-1947";

export const Route = createFileRoute("/super-admin/buyers")({ component: BuyerDeskRoute });

type Buyer = {
  id: string;
  display_name: string;
  account_type: string;
  last_login: string | null;
  active_mappings: number;
};
type Activity = {
  buyer_id: string;
  buyer_name: string;
  title_id: string;
  title_name: string;
  has_mapping: boolean;
  access_active: boolean;
  access_granted_at: string | null;
  deal_status: string | null;
  licensed_at: string | null;
  rights_category: string | null;
  territories: string | null;
  languages: string | null;
  media_modes: string | null;
  rights_notes: string | null;
  payment_status: string | null;
  payment_amount_paise: string | null;
  payment_currency: string | null;
  watch_count: number;
  last_watched_at: string | null;
  workflow: string[];
  request_tracking: string;
  download_permission: string;
};

async function getPrivateJson<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to access the super-admin buyer desk.");
  const response = await fetch(path, { headers: { Authorization: "Bearer " + token } });
  if (!response.ok) {
    if (response.status === 403) throw new Error("Super admin access required (403).");
    throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Buyer desk request failed.");
  }
  return response.json() as Promise<T>;
}

function formatAmount(paise: string | null, currency: string | null) {
  if (paise === null || !currency || !Number.isFinite(Number(paise))) return "Not recorded";
  return currency + " " + (Number(paise) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
    queryKey: ["super-admin-buyer-desk-activity", JANANAM_TITLE_ID],
    queryFn: () => getPrivateJson<{ activity: Activity[] }>(
      "/api/bridge/super-admin/buyer-activity?title_id=" + JANANAM_TITLE_ID,
    ),
  });
  const buyers = buyersQ.data?.buyers ?? [];
  const activity = activityQ.data?.activity ?? [];
  const byId = new Map(buyers.map((buyer) => [buyer.id, buyer]));

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Private control plane · Super Admin</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Buyer Desk & Licensing</h2>
        <p className="mt-2 text-sm text-muted">
          Jananam 1947 · legacy film ID 7 · canonical title ID {JANANAM_TITLE_ID}.
          Buyer contact emails are intentionally not returned by the API.
        </p>
        <p role="status" className="mt-3 rounded border border-line px-3 py-2 text-sm text-muted">
          Read-only review mode. The current Bridge schema does not store the legacy download / film-info / trailer request flags,
          allow_download, or a last-login timestamp. Those fields are not inferred from access grants.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Buyer accounts</h3>
          <span className="text-sm text-muted">{buyers.length} buyer accounts</span>
        </div>
        {buyersQ.isPending ? <p className="py-4 text-sm text-muted">Loading buyer accounts…</p> : null}
        {buyersQ.isError ? <p role="alert" className="py-4 text-sm text-accent">{buyersQ.error.message}</p> : null}
        {!buyersQ.isPending && !buyersQ.isError ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-2 py-3">Buyer</th>
                  <th className="px-2 py-3">Account type</th>
                  <th className="px-2 py-3">Last login</th>
                  <th className="px-2 py-3">Active title access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {buyers.map((buyer) => (
                  <tr key={buyer.id}>
                    <td className="px-2 py-3 font-medium">{buyer.display_name}</td>
                    <td className="px-2 py-3">{buyer.account_type}</td>
                    <td className="px-2 py-3 text-muted">
                      {buyer.last_login ? new Date(buyer.last_login).toLocaleString() : "Not tracked in Bridge schema"}
                    </td>
                    <td className="px-2 py-3 tabular-nums">{buyer.active_mappings}</td>
                  </tr>
                ))}
                {!buyers.length ? (
                  <tr><td colSpan={4} className="px-2 py-6 text-center text-muted">No buyer profiles found in this environment.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Jananam 1947 · Rights, payments & activity</h3>
          <span className="text-sm text-muted">{activity.length} buyer/title records</span>
        </div>
        {activityQ.isPending ? <p className="py-4 text-sm text-muted">Loading licensing activity…</p> : null}
        {activityQ.isError ? <p role="alert" className="py-4 text-sm text-accent">{activityQ.error.message}</p> : null}
        {!activityQ.isPending && !activityQ.isError ? (
          <div className="mt-3 space-y-3">
            {activity.map((item) => {
              const buyer = byId.get(item.buyer_id);
              const rightsScope = [
                item.rights_category,
                item.territories ? "Territories: " + item.territories : null,
                item.languages ? "Languages: " + item.languages : null,
                item.media_modes ? "Media: " + item.media_modes : null,
              ].filter(Boolean).join(" · ");
              return (
                <article key={item.buyer_id + "-" + item.title_id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="font-medium">{buyer?.display_name ?? item.buyer_name}</h4>
                      <p className="mt-1 text-xs text-muted">
                        {item.title_name} · {item.access_active ? "Active access grant" : item.deal_status ? "Deal: " + item.deal_status : "No active access grant"}
                      </p>
                    </div>
                    <span className="rounded border border-line px-2 py-1 text-xs">
                      {item.payment_status === "success" ? "Payment success" : item.payment_status === "pending" ? "Payment pending" : "No payment record"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.workflow.map((stage) => <span key={stage} className="rounded-full border border-line px-2 py-1 text-xs">{stage}</span>)}
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted">Rights scope</dt>
                      <dd className="mt-1 whitespace-pre-wrap">{rightsScope || "No license-deal scope recorded"}</dd>
                      {item.rights_notes ? <dd className="mt-1 whitespace-pre-wrap">{item.rights_notes}</dd> : null}
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Requests</dt>
                      <dd className="mt-1">Download / film info / trailer: not tracked in current Bridge schema</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Payment amount</dt>
                      <dd className="mt-1">{formatAmount(item.payment_amount_paise, item.payment_currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Watch activity</dt>
                      <dd className="mt-1">
                        {item.watch_count} analytics watch events
                        {item.last_watched_at ? " · Last: " + new Date(item.last_watched_at).toLocaleString() : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Download authorization</dt>
                      <dd className="mt-1">Not represented in current Bridge schema · no download enabled</dd>
                    </div>
                  </dl>
                  <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                    No permission mutation or download URL is exposed. A license/access record alone does not prove the OCI asset is verified or authorize download.
                  </p>
                </article>
              );
            })}
            {!activity.length ? (
              <p className="py-6 text-center text-sm text-muted">
                No buyer, deal, entitlement, payment, or watch-event rows found for Jananam 1947 in this environment.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
