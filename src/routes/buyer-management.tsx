import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listSuperAdminBuyerManagement } from "@/lib/bridge/super-admin-buyers";

export const Route = createFileRoute("/buyer-management")({ component: BuyerManagement });

type BuyerRow = {
  userId: string; email: string; displayName: string; organizationLabel: string | null;
  organizationId: string | null; emailVerified: boolean; createdAt: string | null;
  memberships: Array<{ organizationId: string; organizationName: string; role: string; status: string }>;
};

function BuyerManagement() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Buyer Management">
          <BuyerManagementBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerManagementBody() {
  const [search, setSearch] = useState("");
  const [selectedBuyer, setSelectedBuyer] = useState<string | null>(null);
  const [tab, setTab] = useState<"buyers" | "organizations" | "licensing" | "audit">("buyers");
  const query = useQuery({
    queryKey: ["super-admin-buyer-management"],
    queryFn: () => listSuperAdminBuyerManagement(),
    retry: false,
    staleTime: 15_000,
  });
  const buyers = (query.data?.buyers ?? []) as BuyerRow[];
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buyers.filter((b) => !q || [b.displayName, b.email, b.organizationLabel ?? "", b.userId]
      .some((v) => v.toLowerCase().includes(q)));
  }, [buyers, search]);
  const selected = visible.find((b) => b.userId === selectedBuyer) ?? null;
  const licensing = query.data?.licensing;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bridge · commercial access control</p>
            <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Independent Buyer accounts</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              Manage visibility into Buyer identities, organization links, licensing activity and audit evidence.
              Account identity, organization membership, contract rights, payment and title access remain separate approvals.
            </p>
          </div>
          <span className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted">Read-only · Production-safe</span>
        </div>
      </section>

      {query.isPending ? (
        <section className="rounded-xl border border-line p-6 text-sm text-muted" role="status">Loading Buyer records and licensing summaries…</section>
      ) : query.isError ? (
        <section className="rounded-xl border border-line p-6" role="alert">
          <h3 className="font-semibold">Buyer data is unavailable</h3>
          <p className="mt-2 text-sm text-muted">The server could not verify the required profile, organization or licensing data contracts. No empty-state or zero-count assumption is shown.</p>
          <button type="button" onClick={() => void query.refetch()} className="mt-4 text-sm font-semibold text-accent underline">Retry data check</button>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Buyer accounts" value={query.data.buyerCount.toLocaleString("en-IN")} note="Latest 500 profile records" />
            <Metric label="Organizations" value={query.data.organizationCount.toLocaleString("en-IN")} note="Latest 200 canonical organizations" />
            <Metric label="Captured licensing payments" value={sumState(licensing?.paymentStates ?? [], "captured").toLocaleString("en-IN")} note="Verified database payment state" />
            <Metric label="Entitlements" value={(licensing?.entitlementStates ?? []).reduce((n, x) => n + x.count, 0).toLocaleString("en-IN")} note="Persisted Bridge entitlement records" />
          </section>

          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3" role="tablist" aria-label="Buyer management sections">
            {(["buyers", "organizations", "licensing", "audit"] as const).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
                className={`rounded-full border px-4 py-2 text-sm capitalize ${tab === value ? "border-accent text-accent" : "border-line text-muted hover:text-fg"}`}>
                {value}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted">Updated {new Date(query.data.generatedAt).toLocaleString("en-IN")}</span>
          </div>

          {tab === "buyers" ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-semibold">Buyer profile registry</h3><p className="mt-1 text-xs text-muted">Each Buyer is a separate Bridge account. A display organization name is not proof of legal membership.</p></div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or organization" aria-label="Search Buyer accounts" className="h-10 w-full max-w-sm rounded-lg border border-line bg-elevated px-3 text-sm" />
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-line bg-surface text-xs uppercase tracking-wider text-muted">
                    <tr><th className="px-4 py-3">Buyer</th><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Verification</th><th className="px-4 py-3">Memberships</th><th className="px-4 py-3">Account created</th><th className="px-4 py-3"> </th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visible.map((buyer) => (
                      <tr key={buyer.userId} className={selectedBuyer === buyer.userId ? "bg-accent/5" : ""}>
                        <td className="px-4 py-3"><p className="font-medium">{buyer.displayName || "Unnamed Buyer"}</p><p className="mt-1 text-xs text-muted">{buyer.email}</p></td>
                        <td className="px-4 py-3">{buyer.memberships.length ? buyer.memberships.map((m) => m.organizationName).join(", ") : <span className="text-muted">Not linked</span>}</td>
                        <td className="px-4 py-3"><span className={buyer.emailVerified ? "text-emerald-400" : "text-amber-400"}>{buyer.emailVerified ? "Email verified" : "Unverified"}</span></td>
                        <td className="px-4 py-3 tabular-nums">{buyer.memberships.length}</td>
                        <td className="px-4 py-3 text-xs text-muted">{buyer.createdAt ? new Date(buyer.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="px-4 py-3"><button type="button" onClick={() => setSelectedBuyer(selectedBuyer === buyer.userId ? null : buyer.userId)} className="text-xs font-semibold text-accent underline">{selectedBuyer === buyer.userId ? "Close" : "Details"}</button></td>
                      </tr>
                    ))}
                    {!visible.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">{buyers.length ? "No Buyer accounts match this search." : "No Buyer profiles exist in this returned data window."}</td></tr> : null}
                  </tbody>
                </table>
              </div>
              {selected ? <BuyerDetails buyer={selected} /> : null}
            </section>
          ) : null}

          {tab === "organizations" ? <Organizations rows={query.data.organizations} /> : null}
          {tab === "licensing" ? <Licensing data={licensing} /> : null}
          {tab === "audit" ? <Audit rows={query.data.recentAudit} /> : null}
        </>
      )}

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Authorization boundary</h3>
        <div className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <p>• Creating a Buyer profile does not create an organization membership.</p>
          <p>• Membership does not grant title, screener, delivery or playback access.</p>
          <p>• Title visibility is controlled by Bridge QC, legal, rights, packaging, curation and delivery gates.</p>
          <p>• Entitlements are created only by the existing verified payment flow.</p>
          <p>• Loop consumes Bridge-approved publication and title-specific playback authorization.</p>
          <p>• This registry does not expose account suspension, contract mutations, refunds or manual entitlement grants.</p>
        </div>
      </section>
    </div>
  );
}

function BuyerDetails({ buyer }: { buyer: BuyerRow }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold">{buyer.displayName || buyer.email}</h3><p className="mt-1 text-xs text-muted">{buyer.email}</p></div>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">Independent Buyer profile</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Detail label="Bridge user reference" value={buyer.userId} />
        <Detail label="Profile organization label" value={buyer.organizationLabel || "Not provided"} />
        <Detail label="Canonical organization ID" value={buyer.organizationId || "Not linked"} />
        <Detail label="Verified email" value={buyer.emailVerified ? "Yes" : "No"} />
        <Detail label="Created" value={buyer.createdAt ? new Date(buyer.createdAt).toLocaleString("en-IN") : "Not recorded"} />
        <Detail label="Active memberships" value={String(buyer.memberships.filter((m) => m.status === "active").length)} />
      </div>
      {buyer.memberships.length ? <div className="mt-4 border-t border-line pt-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Organization memberships</p><div className="mt-2 flex flex-wrap gap-2">{buyer.memberships.map((m) => <span key={m.organizationId} className="rounded-full border border-line px-3 py-1.5 text-xs">{m.organizationName} · {m.role} · {m.status}</span>)}</div></div> : null}
    </section>
  );
}

function Organizations({ rows }: { rows: Array<{ id: string; legalName: string; status: string; memberCount: number; buyerCount: number; createdAt: string }> }) {
  return (
    <section className="space-y-3">
      <div><h3 className="font-semibold">Buyer organizations</h3><p className="mt-1 text-xs text-muted">Canonical organizations and verified membership counts. Legal ownership is not inferred from names.</p></div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">Legal organization</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Buyer members</th><th className="px-4 py-3">Created</th></tr></thead>
          <tbody className="divide-y divide-line">{rows.map((r) => <tr key={r.id}><td className="px-4 py-3"><p className="font-medium">{r.legalName}</p><p className="mt-1 font-mono text-[10px] text-muted">{r.id}</p></td><td className="px-4 py-3">{r.status}</td><td className="px-4 py-3 tabular-nums">{r.memberCount}</td><td className="px-4 py-3 tabular-nums">{r.buyerCount}</td><td className="px-4 py-3 text-xs text-muted">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td></tr>)}
          {!rows.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No canonical organization records in this data window.</td></tr> : null}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Organization creation, legal verification and membership changes remain in the dedicated Organizations governance workflow.</p>
    </section>
  );
}

function Licensing({ data }: { data: { packageStates: Array<{status:string;count:number}>; paymentStates: Array<{status:string;count:number;capturedAmountPaise:number}>; entitlementStates: Array<{accessType:string;count:number}> } | undefined }) {
  if (!data) return <p className="text-sm text-muted">Licensing data is unavailable.</p>;
  return (
    <section className="space-y-5">
      <div><h3 className="font-semibold">Licensing and payment status</h3><p className="mt-1 text-xs text-muted">Read-only summary from canonical Bridge package, payment and entitlement records. Amounts below reflect captured records only.</p></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <StateList title="License packages" rows={data.packageStates.map((r) => ({label:r.status,count:r.count}))} />
        <StateList title="Payment states" rows={data.paymentStates.map((r) => ({label:r.status,count:r.count, amount:r.status.toLowerCase()==="captured"?formatRupees(r.capturedAmountPaise):undefined}))} />
        <StateList title="Entitlements" rows={data.entitlementStates.map((r) => ({label:r.accessType,count:r.count}))} />
      </div>
      <p className="text-xs text-muted">Payment capture is verified server-side against Razorpay. No entitlement is created by this dashboard.</p>
    </section>
  );
}

function Audit({ rows }: { rows: Array<{createdAt:string;action:string;entityType:string;entityId:string|null;actorReference:string}> }) {
  return (
    <section className="space-y-3">
      <div><h3 className="font-semibold">Buyer and licensing audit events</h3><p className="mt-1 text-xs text-muted">Latest 100 matching persisted events. This view is not a substitute for the full security audit register.</p></div>
      <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-line bg-surface text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Actor reference</th></tr></thead><tbody className="divide-y divide-line">{rows.map((r,i)=><tr key={`${r.createdAt}-${i}`}><td className="px-4 py-3 text-xs text-muted">{new Date(r.createdAt).toLocaleString("en-IN")}</td><td className="px-4 py-3 font-medium">{r.action}</td><td className="px-4 py-3">{r.entityType}<span className="mt-1 block font-mono text-[10px] text-muted">{r.entityId || "—"}</span></td><td className="px-4 py-3 font-mono text-xs text-muted">{r.actorReference}</td></tr>)}{!rows.length?<tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No matching audit events in this data window.</td></tr>:null}</tbody></table></div>
    </section>
  );
}

function StateList({title,rows}:{title:string;rows:Array<{label:string;count:number;amount?:string}>}) {
  return <section className="rounded-xl border border-line p-4"><h4 className="font-semibold">{title}</h4><div className="mt-3 space-y-2">{rows.map((r)=><div key={r.label} className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm"><span className="text-muted">{r.label}</span><span className="text-right font-medium tabular-nums">{r.count.toLocaleString("en-IN")}{r.amount?<small className="ml-2 block text-xs text-muted">{r.amount}</small>:null}</span></div>)}{!rows.length?<p className="text-sm text-muted">No records returned.</p>:null}</div></section>;
}
function Metric({label,value,note}:{label:string;value:string;note:string}) { return <article className="rounded-xl border border-line bg-surface px-4 py-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted">{note}</p></article>; }
function Detail({label,value}:{label:string;value:string}) { return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 break-all text-sm font-medium">{value}</p></div>; }
function sumState(rows:Array<{status:string;count:number}> ,status:string) { return rows.filter((r)=>r.status.toLowerCase()===status).reduce((n,r)=>n+r.count,0); }
function formatRupees(paise:number) { return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(paise/100); }
