import { createFileRoute, Link } from "@tanstack/react-router";
import { Children, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { assertPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/buyer-workspace")({ component: BuyerWorkspace });

type BuyerWorkspaceData = {
  deals: Array<{ id: string; titleId: string; title: string; status: string; territories: string[]; mediaRights: string[]; languages: string[]; fee: string; currency: string; createdAt: string | null }>;
  payments: Array<{ id: string; title: string; purpose: string; amountPaise: number; currency: string; status: string; createdAt: string }>;
  licenses: Array<{ id: number; titleId: string; title: string; accessType: string; createdAt: string }>;
  deliveries: Array<{ id: string; title: string; jobType: string; status: string; updatedAt: string }>;
  screeners: Array<{ id: string; title: string; status: string; createdAt: string }>;
  interests: Array<{ id: string; level: string; createdAt: string }>;
};

const getBuyerWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BuyerWorkspaceData> => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "buyer") throw new Error("Buyer account required");
    assertPermission(actor, "entitlement.read_own");
    const sql = await getSql();

    const [deals, payments, licenses, deliveries, screeners, interests] = await Promise.all([
      sql<{ id: string; title_id: string; title: string; status: string; territories: string[]; media_rights: string[]; languages: string[]; license_fee: string; currency: string | null; created_at: string | Date | null }>`
        select d.id::text, d.title_id, t.name as title, d.status, d.territories, d.media_rights,
          d.languages, d.license_fee::text, d.currency, d.created_at
        from public.bridge_deals d
        join public.bridge_titles t on t.id = d.title_id
        where d.buyer_id = ${actor.userId}
        order by d.updated_at desc nulls last, d.created_at desc nulls last
        limit 100
      `,
      sql<{ id: string; title: string | null; purpose: string; amount_paise: number; currency: string; status: string; created_at: string | Date }>`
        select p.id, t.name as title, p.purpose, p.amount_paise, p.currency, p.status, p.created_at
        from public.bridge_payments p
        left join public.bridge_titles t on t.id = p.title_id
        where p.user_id = ${actor.userId}
        order by p.created_at desc limit 100
      `,
      sql<{ id: number; title_id: string; title: string; access_type: string; created_at: string | Date }>`
        select e.id, e.title_id, t.name as title, e.access_type, e.created_at
        from public.bridge_entitlements e
        join public.bridge_titles t on t.id = e.title_id
        where e.user_id = ${actor.userId}
        order by e.created_at desc limit 100
      `,
      sql<{ id: string; title: string; job_type: string; status: string; updated_at: string | Date }>`
        select j.id::text, t.name as title, j.job_type, j.status, j.updated_at
        from public.bridge_delivery_jobs j
        join public.bridge_deals d on d.title_id = j.title_id and d.buyer_id = ${actor.userId}
        join public.bridge_titles t on t.id = j.title_id
        where d.buyer_id = ${actor.userId}
        order by j.updated_at desc limit 100
      `,
      sql<{ id: string; title: string; status: string; created_at: string | Date }>`
        select r.id, t.name as title, r.status, r.created_at
        from public.bridge_screener_requests r
        join public.bridge_titles t on t.id = r.title_id
        where r.buyer_user_id = ${actor.userId}
        order by r.created_at desc limit 100
      `,
      sql<{ id: string; interest_level: string; created_at: string | Date }>`
        select id::text, interest_level, created_at
        from public.bridge_buyer_interest
        where buyer_user_id = ${actor.userId}
        order by created_at desc limit 100
      `,
    ]);

    const iso = (value: string | Date | null) => value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null;
    return {
      deals: deals.map((r) => ({ id: r.id, titleId: r.title_id, title: r.title, status: r.status, territories: r.territories ?? [], mediaRights: r.media_rights ?? [], languages: r.languages ?? [], fee: r.license_fee, currency: r.currency ?? "INR", createdAt: iso(r.created_at) })),
      payments: payments.map((r) => ({ id: r.id, title: r.title ?? "Title not available", purpose: r.purpose, amountPaise: Number(r.amount_paise), currency: r.currency, status: r.status, createdAt: iso(r.created_at) ?? "" })),
      licenses: licenses.map((r) => ({ id: r.id, titleId: r.title_id, title: r.title, accessType: r.access_type, createdAt: iso(r.created_at) ?? "" })),
      deliveries: deliveries.map((r) => ({ id: r.id, title: r.title, jobType: r.job_type, status: r.status, updatedAt: iso(r.updated_at) ?? "" })),
      screeners: screeners.map((r) => ({ id: r.id, title: r.title, status: r.status, createdAt: iso(r.created_at) ?? "" })),
      interests: interests.map((r) => ({ id: r.id, level: r.interest_level, createdAt: iso(r.created_at) ?? "" })),
    };
  });

function BuyerWorkspace() {
  return (
    <RequireBridge allow="buyer">
      {(actor) => (
        <BridgeShell actor={actor} title="Buyer workspace">
          <BuyerWorkspaceBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerWorkspaceBody() {
  const query = useQuery({ queryKey: ["bridge-buyer-workspace"], queryFn: () => getBuyerWorkspace(), retry: 1 });
  if (query.isPending) return <p role="status" className="text-sm text-muted">Loading your licensing workspace…</p>;
  if (query.isError) return <section role="alert" className="rounded-xl border border-line p-5"><h2 className="font-semibold">Buyer workspace unavailable</h2><p className="mt-2 text-sm text-muted">Your records could not be loaded. No records have been changed.</p><button className="mt-3 text-sm underline" onClick={() => void query.refetch()}>Retry</button></section>;

  const data = query.data;
  const totalCaptured = data.payments.filter((p) => p.status.toLowerCase() === "captured").reduce((sum, p) => sum + p.amountPaise, 0);
  const sections = [
    { label: "Deals", value: data.deals.length, note: "Your licensing agreements" },
    { label: "Screeners", value: data.screeners.length, note: "Your private access requests" },
    { label: "Licenses", value: data.licenses.length, note: "Recorded entitlements" },
    { label: "Deliveries", value: data.deliveries.length, note: "Delivery work for your deals" },
  ];
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Private B2B workspace</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">Your licensing activity, in one place.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Track your own enquiries, agreements, secure screener requests, captured payments, licenses and deliveries. Bridge publishes only titles and rights that have passed its authorization checks.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/buyer" className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">Discover licensing titles</Link>
          <Link to="/account" className="rounded-full border border-line px-4 py-2 text-sm">Account & verification</Link>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((item) => <article key={item.label} className="rounded-xl border border-line bg-surface p-4"><p className="text-xs uppercase tracking-wider text-muted">{item.label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{item.value}</p><p className="mt-1 text-xs text-muted">{item.note}</p></article>)}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Licensing deals" empty="No licensing deals are recorded for this Buyer account.">
          {data.deals.map((deal) => <div key={deal.id} className="border-b border-line py-3 last:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{deal.title}</strong><State value={deal.status}/></div><p className="mt-1 text-xs text-muted">{[...deal.territories, ...deal.mediaRights, ...deal.languages].join(" · ") || "Scope not recorded"} · {deal.currency} {deal.fee}</p></div>)}
        </Panel>
        <Panel title="Private screener requests" empty="You have no screener requests.">
          {data.screeners.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"><div><strong className="text-sm">{item.title}</strong><p className="text-xs text-muted">{date(item.createdAt)}</p></div><State value={item.status}/></div>)}
        </Panel>
        <Panel title="Captured payments & finance" empty="No payment records are associated with this account.">
          <div className="mb-3 rounded-lg bg-panel p-3"><p className="text-xs text-muted">Captured payment total</p><p className="mt-1 text-xl font-semibold">{money(totalCaptured)}</p><p className="text-[11px] text-muted">Calculated from captured Bridge payment records only</p></div>
          {data.payments.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"><div><strong className="text-sm">{item.title}</strong><p className="text-xs text-muted">{item.purpose} · {date(item.createdAt)}</p></div><div className="text-right"><strong className="text-sm">{money(item.amountPaise, item.currency)}</strong><State value={item.status}/></div></div>)}
        </Panel>
        <Panel title="Licenses & delivery" empty="No captured license or delivery records are available yet.">
          {data.licenses.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"><div><strong className="text-sm">{item.title}</strong><p className="text-xs text-muted">{item.accessType} · {date(item.createdAt)}</p></div><State value="LICENSED"/></div>)}
          {data.deliveries.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"><div><strong className="text-sm">{item.title}</strong><p className="text-xs text-muted">{item.jobType} · {date(item.updatedAt)}</p></div><State value={item.status}/></div>)}
        </Panel>
      </section>
      <section className="rounded-xl border border-line p-4"><h2 className="font-semibold">Buyer interest history</h2>{data.interests.length ? data.interests.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-0"><span>{item.level}</span><span className="text-xs text-muted">{date(item.createdAt)}</span></div>) : <p className="mt-2 text-sm text-muted">No buyer interest history is recorded.</p>}</section>
      <p className="text-xs text-muted">This workspace is currently scoped to the signed-in Bridge Buyer user. Organization-wide Buyer membership and cross-user access are not enabled by this page and remain subject to a separate verified authorization rollout.</p>
    </div>
  );
}

function Panel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-line bg-surface p-4"><h2 className="mb-3 font-semibold">{title}</h2>{Children.count(children) > 0 ? <div>{children}</div> : <p className="text-sm text-muted">{empty}</p>}</section>;
}
function State({ value }: { value: string }) { return <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium">{value.replaceAll("_", " ")}</span>; }
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function money(amountPaise: number, currency = "INR") { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amountPaise / 100); }
