import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listPublishedInvestmentOffers, requestInvestmentInformation } from "@/lib/bridge/investment-offers";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/investor")({ component: Investor });
const money = (p: unknown) => "₹" + (Number(p ?? 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
function Investor() {
  return <RequireBridge allow="investor">{(actor) => <BridgeShell actor={actor} title="Investor desk"><InvestorBody userId={actor.userId} /></BridgeShell>}</RequireBridge>;
}
function InvestorBody({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const portfolio = useQuery({ queryKey: ["bridge-investor-investments", userId], queryFn: () => listInvestorInvestments(userId) });
  const offersQ = useQuery({ queryKey: ["bridge-investment-offers-investor", userId], queryFn: () => listPublishedInvestmentOffers() });
  const [amounts, setAmounts] = useState<Record<string,string>>({});
  const [notes, setNotes] = useState<Record<string,string>>({});
  const request = useMutation({ mutationFn: (v:{offerId:string;amountPaise:number;note?:string}) => requestInvestmentInformation({ data: v }), onSuccess: () => qc.invalidateQueries({queryKey:["bridge-investment-offers-investor",userId]}) });
  const rows = portfolio.data?.investments ?? [];
  const offers = offersQ.data?.offers ?? [];
  const interests = offersQ.data?.interests ?? [];
  const requested = new Set(interests.map((i:any)=>i.offer_id));
  const capital = rows.reduce((s,r)=>s+Number(r.investedAmountPaise??0),0);
  return <div className="space-y-6">
    <section className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-xl border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Access</p><p className="mt-2 text-sm">Published offers only. No title edits or rights grants.</p></article>
      <article className="rounded-xl border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Your portfolio</p><p className="mt-2 text-sm">Investment records assigned to your account.</p></article>
      <article className="rounded-xl border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Recorded capital</p><p className="mt-2 text-2xl font-semibold">{money(capital)}</p><p className="mt-1 text-xs text-muted">Recorded entries only; not independently reconciled.</p></article>
    </section>
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Bridge master distribution opportunities</p><h2 className="mt-2 font-display text-3xl font-semibold">Title investment offers</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">Review each title's amount range, participation basis, tenure and rights exclusions. Requesting information is non-binding; this is not a subscription, payment instruction or promise of returns.</p>
      {offersQ.isPending ? <p className="mt-5 text-sm text-muted">Loading approved offers…</p> : null}
      {offersQ.isError ? <p role="alert" className="mt-5 rounded-xl border border-line p-4 text-sm">Published offers are not available in this environment. No investment payment or subscription is enabled.</p> : null}
      {!offersQ.isPending&&!offersQ.isError&&!offers.length ? <div className="mt-5 rounded-xl border border-line p-5"><h3 className="font-semibold">No approved offers are published</h3><p className="mt-1 text-sm text-muted">Only titles with Bridge readiness and documented legal/compliance approval can appear here. Existing title records are not automatically investment offers.</p></div> : null}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">{offers.map((o:any)=><article key={o.id} className="rounded-2xl border border-line p-5">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-xl font-semibold">{o.title_name}</h3><p className="text-sm text-muted">{o.content_type} · {o.language}</p></div><span className="rounded-full border border-line px-3 py-1 text-xs">Published offer</span></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">Minimum</dt><dd className="font-semibold">{money(o.minimum_amount_paise)}</dd></div><div><dt className="text-muted">Target</dt><dd className="font-semibold">{money(o.target_amount_paise)}</dd></div><div><dt className="text-muted">Maximum</dt><dd className="font-semibold">{money(o.maximum_amount_paise)}</dd></div><div><dt className="text-muted">Tenure</dt><dd className="font-semibold">{o.tenure_months} months</dd></div><div className="col-span-2"><dt className="text-muted">Participation basis</dt><dd>{String(o.participation_basis).replaceAll("_"," ")}{o.participation_percent?` · ${Number(o.participation_percent).toFixed(2)}%`:""}</dd></div></dl>
        <div className="mt-4 space-y-2 text-sm"><p><strong>Included:</strong> {(o.rights_included??[]).join(", ")}</p><p><strong>Excluded:</strong> {(o.rights_excluded??[]).join(", ")}</p><p><strong>Territories:</strong> {(o.territories??[]).join(", ")}</p><p><strong>Languages:</strong> {(o.languages??[]).join(", ")}</p><p><strong>Media:</strong> {(o.media??[]).join(", ")}</p><p><strong>Window:</strong> {o.window_start??"Not set"} – {o.window_end??"Not set"}</p><p className="whitespace-pre-wrap text-muted">{o.terms_summary}</p></div>
        <div className="mt-5 border-t border-line pt-4"><label className="block text-sm">Indicative interest amount (INR)<input type="number" min={Number(o.minimum_amount_paise)/100} max={Number(o.maximum_amount_paise)/100} value={amounts[o.id]??String(Number(o.minimum_amount_paise)/100)} onChange={e=>setAmounts(s=>({...s,[o.id]:e.target.value}))} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3"/></label><label className="mt-3 block text-sm">Question / information needed (optional)<textarea rows={2} value={notes[o.id]??""} onChange={e=>setNotes(s=>({...s,[o.id]:e.target.value}))} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3"/></label><button type="button" disabled={request.isPending||requested.has(o.id)} onClick={()=>request.mutate({offerId:o.id,amountPaise:Math.round(Number(amounts[o.id]??Number(o.minimum_amount_paise)/100)*100),note:notes[o.id]})} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#041018] disabled:opacity-50">{requested.has(o.id)?"Information requested":"Request information"}</button></div>
      </article>)}</div>
      {request.isError?<p role="alert" className="mt-3 text-sm text-red-400">{String(request.error.message)}</p>:null}
      {request.isSuccess?<p role="status" className="mt-3 text-sm text-muted">Information request recorded. No funds were requested or collected.</p>:null}
    </section>
    <section className="rounded-3xl border border-line bg-surface p-6"><h2 className="font-display text-2xl font-semibold">Your recorded investments</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-3 py-3">Title</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Capital</th><th className="px-3 py-3">Participation</th><th className="px-3 py-3">Recorded</th></tr></thead><tbody className="divide-y divide-line">{rows.map(row=><tr key={row.id}><td className="px-3 py-3"><Link to="/title/$id" params={{id:row.titleId}} className="font-medium hover:text-accent">{row.titleName}</Link></td><td className="px-3 py-3">{row.investmentReference??"—"}</td><td className="px-3 py-3">{money(row.investedAmountPaise)}</td><td className="px-3 py-3">{Number(row.participationPercent??0).toFixed(2)}%</td><td className="px-3 py-3">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td></tr>)}{!rows.length?<tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No investment records are assigned to this account yet.</td></tr>:null}</tbody></table></div></section>
    <p className="text-xs leading-relaxed text-muted">Investment structures may be regulated. Publication requires qualified Indian legal/compliance review, investor eligibility checks and approved documents. This desk does not accept subscriptions or payments.</p>
  </div>;
}
async function listInvestorInvestments(investorUserId:string) {
  const sql=await getSql();
  const rows=await sql<{id:string;title_id:string;title_name:string;investment_reference:string|null;invested_amount_paise:number|string|null;participation_percent:number|string|null;created_at:string|Date}>`select i.id,i.title_id,t.name as title_name,i.investment_reference,i.invested_amount_paise,i.participation_percent,i.created_at from bridge_title_investors i join bridge_titles t on t.id=i.title_id where i.investor_user_id=${investorUserId} order by i.created_at desc limit 200`;
  return {investments:rows.map(r=>({id:r.id,titleId:r.title_id,titleName:r.title_name,investmentReference:r.investment_reference,investedAmountPaise:r.invested_amount_paise,participationPercent:r.participation_percent,createdAt:r.created_at instanceof Date?r.created_at.toISOString():String(r.created_at)}))};
}
