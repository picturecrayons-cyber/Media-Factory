import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BridgeActor } from "@/lib/bridge/session";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import {
  createBroadcastOffer, createBroadcastPartner, listLicensingWorkspace,
  transitionLicensingDeal,
} from "@/lib/bridge/licensing";

const MARKET_STATUSES = ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"] as const;
type DeskTab = "market" | "buyers" | "television";

export const Route = createFileRoute("/licensing")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: LicensingDesk,
});

function LicensingDesk() {
  return <RequireBridge allow="internal">{(actor) => {
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
      return <BridgeShell actor={actor} title="Licensing Desk"><section className="rounded-xl border border-line bg-surface p-6"><h2 className="font-semibold">Licensing administration required</h2><p className="mt-2 text-sm text-muted">This desk is restricted to verified Bridge administrators.</p></section></BridgeShell>;
    }
    return <LicensingDeskBody actor={actor}/>;
  }}</RequireBridge>;
}

function LicensingDeskBody({actor}:{actor:BridgeActor}) {
  const [tab,setTab]=useState<DeskTab>("market");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [partnerType,setPartnerType]=useState<"TV_CHANNEL"|"BROADCASTER">("TV_CHANNEL");
  const [partnerName,setPartnerName]=useState("");
  const [partnerLegal,setPartnerLegal]=useState("");
  const [partnerCountry,setPartnerCountry]=useState("India");
  const [contactName,setContactName]=useState("");
  const [contactEmail,setContactEmail]=useState("");
  const [offerTitle,setOfferTitle]=useState("");
  const [offerPartner,setOfferPartner]=useState("");
  const [territories,setTerritories]=useState("WORLDWIDE");
  const [languages,setLanguages]=useState("Malayalam");
  const [media,setMedia]=useState("LINEAR_TV");
  const [windowStart,setWindowStart]=useState("");
  const [windowEnd,setWindowEnd]=useState("");
  const [exclusivity,setExclusivity]=useState<"EXCLUSIVE"|"NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [fee,setFee]=useState("");
  const [videoFormat,setVideoFormat]=useState("HD 1080p");
  const [audioFormat,setAudioFormat]=useState("Stereo");
  const [deliveryDeadline,setDeliveryDeadline]=useState("");
  const [notes,setNotes]=useState("");
  const qc=useQueryClient();
  const titlesQ=useQuery({queryKey:["bridge-licensing-desk-titles"],queryFn:()=>listTitles(),retry:1});
  const readinessQ=useQuery({queryKey:["bridge-licensing-desk-readiness"],queryFn:()=>listLoopPublicationReadiness(),retry:1});
  const workspaceQ=useQuery({queryKey:["bridge-licensing-workspace"],queryFn:()=>listLicensingWorkspace(),retry:1});
  const titles=titlesQ.data?.titles??[];
  const market=useMemo(()=>titles.filter(t=>MARKET_STATUSES.includes(t.status as (typeof MARKET_STATUSES)[number])),[titles]);
  const filtered=useMemo(()=>market.filter(t=>(!query.trim()||`${t.name} ${t.language}`.toLowerCase().includes(query.trim().toLowerCase()))&&(status==="all"||t.status===status)),[market,query,status]);
  const readinessById=new Map((readinessQ.data?.titles??[]).map(t=>[t.id,t]));
  const partners=workspaceQ.data?.partners??[];
  const buyers=workspaceQ.data?.buyers??[];
  const deals=workspaceQ.data?.deals??[];
  const refresh=()=>{void qc.invalidateQueries({queryKey:["bridge-licensing-workspace"]});void qc.invalidateQueries({queryKey:["bridge-licensing-desk-titles"]});};
  const partnerMutation=useMutation({mutationFn:()=>createBroadcastPartner({data:{partnerType,legalName:partnerLegal||partnerName,displayName:partnerName,country:partnerCountry,contactName:contactName||undefined,contactEmail:contactEmail||undefined}}),onSuccess:()=>{toast.success("Broadcast partner recorded");setPartnerName("");setPartnerLegal("");setContactName("");setContactEmail("");refresh();},onError:e=>toast.error(e instanceof Error?e.message:"Partner creation failed")});
  const offerMutation=useMutation({mutationFn:()=>createBroadcastOffer({data:{
    titleId:offerTitle,partnerId:offerPartner,territories:territories.split(",").map(x=>x.trim()).filter(Boolean),
    languages:languages.split(",").map(x=>x.trim()).filter(Boolean),media:media.split(",").map(x=>x.trim()).filter(Boolean),
    windowStart:new Date(windowStart).toISOString(),windowEnd:new Date(windowEnd).toISOString(),exclusivity,
    offerFeePaise:fee.trim()?Math.round(Number(fee)*100):null,videoFormat,audioFormat,deliveryDeadline:deliveryDeadline||undefined,notes:notes||undefined
  }}),onSuccess:()=>{toast.success("Broadcast offer draft recorded; no rights or delivery authorization granted");setNotes("");refresh();},onError:e=>toast.error(e instanceof Error?e.message:"Offer could not be saved")});
  const transitionMutation=useMutation({mutationFn:(data:{dealId:string;status:"OFFERED"|"NEGOTIATION"|"AGREEMENT_PENDING"|"AGREEMENT_RECORDED"|"APPROVED"|"REJECTED"|"CANCELLED";agreementReference?:string;rightsGrantId?:string;offerFeePaise?:number|null;windowStart?:string;windowEnd?:string;exclusivity?:"EXCLUSIVE"|"NON_EXCLUSIVE";notes?:string})=>transitionLicensingDeal({data}),onSuccess:()=>{toast.success("Deal status updated");refresh();},onError:e=>toast.error(e instanceof Error?e.message:"Deal update failed")});
  function submit(e:FormEvent,fn:()=>void){e.preventDefault();fn();}
  return <BridgeShell actor={actor} title="Licensing Desk">
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-surface p-5"><p className="text-xs font-semibold uppercase tracking-wider text-accent">Bridge · Rights to market</p><h2 className="mt-1 font-display text-2xl font-semibold">Licensing control desk</h2><p className="mt-2 max-w-3xl text-sm text-muted">Separate title licensing, external buyer activity and television/broadcast contracts. No module grants rights or Loop publication by itself.</p><div className="mt-3 flex gap-2"><Link to="/admin/workstations"><Button variant="outline">Operations & approvals</Button></Link><Link to="/buyer"><Button variant="outline">Buyer catalogue</Button></Link></div></section>
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Licensing candidates" value={titlesQ.isPending?"…":titlesQ.isError?"Unavailable":String(market.length)} note="Recorded Bridge title states"/><Metric label="External buyers" value={workspaceQ.isPending?"…":workspaceQ.isError?"Unavailable":String(buyers.length)} note="Verified account records"/><Metric label="Broadcast partners" value={workspaceQ.isPending?"…":workspaceQ.isError?"Unavailable":String(partners.length)} note="Channel and broadcaster records"/></div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Licensing workspaces"><Tab active={tab==="market"} onClick={()=>setTab("market")}>Market-ready titles</Tab><Tab active={tab==="buyers"} onClick={()=>setTab("buyers")}>External Buyers</Tab><Tab active={tab==="television"} onClick={()=>setTab("television")}>Television & Broadcast</Tab></div>
      {tab==="market"?<section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5"><div><h3 className="font-display text-xl font-semibold">Market-ready title queue</h3><p className="mt-1 text-sm text-muted">Candidate status does not equal buyer visibility. The server publication preflight remains authoritative.</p></div><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Search title" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search title or language" className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm sm:max-w-md"/><select aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)} className="rounded-md border border-line bg-bg px-3 py-2 text-sm"><option value="all">All stages</option>{MARKET_STATUSES.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></div>{titlesQ.isPending?<p role="status">Loading titles…</p>:null}{titlesQ.isError?<p role="alert">Title records unavailable. <button onClick={()=>void titlesQ.refetch()} className="underline">Retry</button></p>:null}{!titlesQ.isPending&&!titlesQ.isError&&!filtered.length?<p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">No titles in these licensing stages.</p>:null}{filtered.length>0?<div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">Title</th><th className="p-3">Status</th><th className="p-3">Language</th><th className="p-3">Fee</th><th className="p-3">Release gates</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-line">{filtered.map(t=>{const r=readinessById.get(t.id);return <tr key={t.id}><td className="p-3 font-medium">{t.name}</td><td className="p-3">{t.status.replaceAll("_"," ")}</td><td className="p-3">{t.language||"—"}</td><td className="p-3">{t.licensingFeePaise>0?new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(t.licensingFeePaise/100):"Unset"}</td><td className="p-3">{readinessQ.isPending?"Checking…":readinessQ.isError?"Not verified":r?.ready?<span className="text-emerald-600">All gates passed</span>:<details><summary className="cursor-pointer text-amber-600">{r?.blockers.length??"Unavailable"} blocker(s)</summary><ul className="mt-2 list-disc pl-4 text-xs text-muted">{(r?.blockers??["Readiness evidence unavailable"]).map((b,i)=><li key={i}>{b}</li>)}</ul></details>}</td><td className="p-3"><Link to="/title/$id" params={{id:t.id}} className="font-semibold text-accent hover:underline">Open title →</Link></td></tr>})}</tbody></table></div>:null}</section>:null}
      {tab==="buyers"?<section className="space-y-4 rounded-xl border border-line bg-surface p-5"><div><h3 className="font-display text-xl font-semibold">External Buyer accounts & enquiries</h3><p className="mt-1 text-sm text-muted">Buyer identity remains a separate public account type. Catalogue visibility and payment entitlements remain server-gated.</p></div>{workspaceQ.isError?<p role="alert">Buyer workspace unavailable. <button className="underline" onClick={()=>void workspaceQ.refetch()}>Retry</button></p>:null}<div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="p-2">Buyer</th><th className="p-2">Email</th><th className="p-2">Verified</th></tr></thead><tbody className="divide-y divide-line">{buyers.map((b:any)=><tr key={b.user_id}><td className="p-2">{b.display_name||"—"}</td><td className="p-2">{b.email}</td><td className="p-2">{b.email_verified?"Yes":"No"}</td></tr>)}</tbody></table></div><h4 className="font-semibold">Buyer enquiries / offers</h4><DealTable deals={deals.filter((d:any)=>d.deal_type==="EXTERNAL_BUYER")} onStatus={(dealId,status,terms)=>transitionMutation.mutate({dealId,status,...terms})}/><p className="text-xs text-muted">External Buyers submit title-specific enquiries from an eligible Buyer catalogue listing. This desk does not create buyer accounts or grant catalogue access.</p><Link to="/buyer"><Button variant="outline">Open Buyer catalogue</Button></Link></section>:null}
      {tab==="television"?<div className="grid gap-4 xl:grid-cols-2"><section className="space-y-3 rounded-xl border border-line bg-surface p-5"><h3 className="font-display text-xl font-semibold">Broadcast partners</h3><form className="grid gap-2" onSubmit={e=>submit(e,()=>partnerMutation.mutate())}><select value={partnerType} onChange={e=>setPartnerType(e.target.value as typeof partnerType)} className="rounded-md border border-line bg-bg p-2 text-sm"><option value="TV_CHANNEL">TV Channel</option><option value="BROADCASTER">Broadcast Network / Aggregator</option></select><input required value={partnerName} onChange={e=>setPartnerName(e.target.value)} placeholder="Channel / partner display name" className="rounded-md border border-line bg-bg p-2 text-sm"/><input required value={partnerLegal} onChange={e=>setPartnerLegal(e.target.value)} placeholder="Legal entity name" className="rounded-md border border-line bg-bg p-2 text-sm"/><input required value={partnerCountry} onChange={e=>setPartnerCountry(e.target.value)} placeholder="Country" className="rounded-md border border-line bg-bg p-2 text-sm"/><div className="grid gap-2 sm:grid-cols-2"><input value={contactName} onChange={e=>setContactName(e.target.value)} placeholder="Contact person (optional)" className="rounded-md border border-line bg-bg p-2 text-sm"/><input type="email" value={contactEmail} onChange={e=>setContactEmail(e.target.value)} placeholder="Contact email (optional)" className="rounded-md border border-line bg-bg p-2 text-sm"/></div><Button type="submit" disabled={partnerMutation.isPending}>Record partner</Button></form><div className="space-y-2">{partners.map((p:any)=><div key={p.id} className="rounded-md border border-line p-3 text-sm"><div className="font-medium">{p.display_name}</div><div className="text-xs text-muted">{p.partner_type.replaceAll("_"," ")} · {p.legal_name} · {p.country} · {p.status}</div></div>)}</div></section>
      <section className="space-y-3 rounded-xl border border-line bg-surface p-5"><h3 className="font-display text-xl font-semibold">Channel offer / delivery brief</h3><form className="grid gap-2" onSubmit={e=>submit(e,()=>offerMutation.mutate())}><select required value={offerTitle} onChange={e=>setOfferTitle(e.target.value)} className="rounded-md border border-line bg-bg p-2 text-sm"><option value="">Select Bridge title</option>{titles.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select required value={offerPartner} onChange={e=>setOfferPartner(e.target.value)} className="rounded-md border border-line bg-bg p-2 text-sm"><option value="">Select channel / broadcaster</option>{partners.filter((p:any)=>p.status==="ACTIVE").map((p:any)=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select><div className="grid gap-2 sm:grid-cols-2"><input required value={territories} onChange={e=>setTerritories(e.target.value)} placeholder="Territories (comma separated)" className="rounded-md border border-line bg-bg p-2 text-sm"/><input required value={languages} onChange={e=>setLanguages(e.target.value)} placeholder="Languages (comma separated)" className="rounded-md border border-line bg-bg p-2 text-sm"/><input required value={media} onChange={e=>setMedia(e.target.value)} placeholder="Media (e.g. LINEAR_TV)" className="rounded-md border border-line bg-bg p-2 text-sm"/><select value={exclusivity} onChange={e=>setExclusivity(e.target.value as typeof exclusivity)} className="rounded-md border border-line bg-bg p-2 text-sm"><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select><input required type="datetime-local" value={windowStart} onChange={e=>setWindowStart(e.target.value)} className="rounded-md border border-line bg-bg p-2 text-sm"/><input required type="datetime-local" value={windowEnd} onChange={e=>setWindowEnd(e.target.value)} className="rounded-md border border-line bg-bg p-2 text-sm"/><input type="number" min="0" step="0.01" value={fee} onChange={e=>setFee(e.target.value)} placeholder="Offer fee (INR, optional)" className="rounded-md border border-line bg-bg p-2 text-sm"/><input value={videoFormat} onChange={e=>setVideoFormat(e.target.value)} placeholder="Video specification" className="rounded-md border border-line bg-bg p-2 text-sm"/><input value={audioFormat} onChange={e=>setAudioFormat(e.target.value)} placeholder="Audio specification" className="rounded-md border border-line bg-bg p-2 text-sm"/><input value={deliveryDeadline} onChange={e=>setDeliveryDeadline(e.target.value)} placeholder="Delivery deadline (optional)" className="rounded-md border border-line bg-bg p-2 text-sm"/></div><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Internal notes (optional)" rows={2} className="rounded-md border border-line bg-bg p-2 text-sm"/><Button type="submit" disabled={offerMutation.isPending||!offerTitle||!offerPartner||!windowStart||!windowEnd}>Save broadcast offer draft</Button></form><p className="text-xs text-muted">Draft only. A valid rights grant, QC, Legal approval and recorded signed agreement are mandatory before deal approval. Delivery remains HOLD until separately verified.</p></section>
      <section className="space-y-3 rounded-xl border border-line bg-surface p-5 xl:col-span-2"><h3 className="font-display text-xl font-semibold">Broadcast negotiation & agreements</h3><DealTable deals={deals.filter((d:any)=>d.deal_type==="BROADCAST")} onStatus={(dealId,status,terms)=>transitionMutation.mutate({dealId,status,...terms})}/></section></div>:null}
      <p className="text-xs text-muted">No migration is applied by this source change. Deal approval never authorizes Crayons LOOP publication; Bridge's independent QC, rights, legal, packaging, curation, delivery and Loop authorization checks remain mandatory.</p>
    </div>
  </BridgeShell>;
}

function DealTable({deals,onStatus}:{deals:any[];onStatus:(id:string,status:"OFFERED"|"NEGOTIATION"|"AGREEMENT_PENDING"|"AGREEMENT_RECORDED"|"APPROVED"|"REJECTED"|"CANCELLED",terms?:{agreementReference?:string;rightsGrantId?:string;offerFeePaise?:number|null;windowStart?:string;windowEnd?:string;exclusivity?:"EXCLUSIVE"|"NON_EXCLUSIVE"})=>void}) {
  const [agreementRefs,setAgreementRefs]=useState<Record<string,string>>({});
  const [rightsGrantIds,setRightsGrantIds]=useState<Record<string,string>>({});
  const [fees,setFees]=useState<Record<string,string>>({});
  const [starts,setStarts]=useState<Record<string,string>>({});
  const [ends,setEnds]=useState<Record<string,string>>({});
  const [exclusivities,setExclusivities]=useState<Record<string,string>>({});
  const localDateTime=(value:string|Date|null|undefined)=>{if(!value)return "";const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  if(!deals.length)return <p className="rounded-md border border-dashed border-line p-5 text-sm text-muted">No deals or enquiries recorded.</p>;
  return <div className="space-y-2">{deals.map(d=>{
    const feeValue=fees[d.id]??(d.offer_fee_paise==null?"":(Number(d.offer_fee_paise)/100).toFixed(2));
    const startValue=starts[d.id]??localDateTime(d.window_start);
    const endValue=ends[d.id]??localDateTime(d.window_end);
    const exclusiveValue=exclusivities[d.id]??d.exclusivity??"";
    const terms=()=>({
      agreementReference:agreementRefs[d.id]??d.agreement_reference??undefined,
      rightsGrantId:rightsGrantIds[d.id]??d.rights_grant_id??undefined,
      offerFeePaise:feeValue.trim()===""?undefined:Math.round(Number(feeValue)*100),
      windowStart:startValue?new Date(startValue).toISOString():undefined,
      windowEnd:endValue?new Date(endValue).toISOString():undefined,
      exclusivity:exclusiveValue?exclusiveValue as "EXCLUSIVE"|"NON_EXCLUSIVE":undefined,
    });
    return <div key={d.id} className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-medium">{d.title_name}</div><p className="text-xs text-muted">{d.partner_name||d.buyer_name||d.buyer_email||"Buyer"} · {d.status} · delivery {d.delivery_status}</p><p className="text-xs text-muted">{(d.territories||[]).join(", ")} · {(d.languages||[]).join(", ")} · {(d.media||[]).join(", ")}</p></div>
      <select aria-label={"Update deal "+d.id} defaultValue="" onChange={e=>{if(e.target.value)onStatus(d.id,e.target.value as any,terms());e.currentTarget.value="";}} className="rounded-md border border-line bg-bg p-2 text-xs"><option value="">Change stage…</option>{["OFFERED","NEGOTIATION","AGREEMENT_PENDING","AGREEMENT_RECORDED","APPROVED","REJECTED","CANCELLED"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input value={feeValue} onChange={e=>setFees(v=>({...v,[d.id]:e.target.value}))} type="number" min="0" step="0.01" placeholder="Offer fee (₹)" aria-label={"Offer fee for "+d.title_name} className="rounded-md border border-line bg-bg p-2 text-xs"/>
        <input value={startValue} onChange={e=>setStarts(v=>({...v,[d.id]:e.target.value}))} type="datetime-local" aria-label={"Offer starts for "+d.title_name} className="rounded-md border border-line bg-bg p-2 text-xs"/>
        <input value={endValue} onChange={e=>setEnds(v=>({...v,[d.id]:e.target.value}))} type="datetime-local" aria-label={"Offer ends for "+d.title_name} className="rounded-md border border-line bg-bg p-2 text-xs"/>
        <select value={exclusiveValue} onChange={e=>setExclusivities(v=>({...v,[d.id]:e.target.value}))} aria-label={"Exclusivity for "+d.title_name} className="rounded-md border border-line bg-bg p-2 text-xs"><option value="">Select exclusivity</option><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select>
        <input value={agreementRefs[d.id]??d.agreement_reference??""} onChange={e=>setAgreementRefs(v=>({...v,[d.id]:e.target.value}))} placeholder="Signed agreement reference" className="rounded-md border border-line bg-bg p-2 text-xs"/>
        <input value={rightsGrantIds[d.id]??d.rights_grant_id??""} onChange={e=>setRightsGrantIds(v=>({...v,[d.id]:e.target.value}))} placeholder="VALID Bridge rights grant ID (UUID)" className="rounded-md border border-line bg-bg p-2 text-xs"/>
      </div>
      <p className="mt-2 text-xs text-muted">Offer terms must match the signed agreement and VALID rights grant. Enter verified values only; saving an offer does not authorize Loop publication.</p>
      {d.agreement_reference?<p className="mt-1 text-xs text-muted">Recorded agreement: {d.agreement_reference}</p>:null}
    </div>;
  })}</div>;
}
function Metric({label,value,note}:{label:string;value:string;note:string}){return <div className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></div>}
function Tab({active,onClick,children}:{active:boolean;onClick:()=>void;children:ReactNode}){return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`rounded-md border px-3 py-2 text-sm ${active?"border-accent text-accent":"border-line text-muted"}`}>{children}</button>}
