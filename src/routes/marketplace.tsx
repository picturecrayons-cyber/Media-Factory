import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { createLicenseRequest, listMarketplaceTitles } from "@/lib/bridge/marketplace";

export const Route = createFileRoute("/marketplace")({ component: Marketplace });

function Marketplace(){
  return <RequireBridge>{(actor)=><BridgeShell actor={actor} title="Marketplace"><MarketplaceBody /></BridgeShell>}</RequireBridge>;
}

function MarketplaceBody(){
  const q=useQuery({queryKey:["bridge-marketplace"],queryFn:()=>listMarketplaceTitles()});
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<{id:string;name:string}|null>(null);
  const rows=useMemo(()=>{const s=search.trim().toLowerCase();return (q.data?.titles??[]).filter(t=>!s||[t.name,t.language,String(t.year??"")].join(" ").toLowerCase().includes(s));},[q.data,search]);
  return <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-display text-xl font-semibold">Discover rights</h2><p className="mt-1 text-sm text-muted">Browse. Request. Deal. Deliver.</p></div>
        <input aria-label="Search marketplace" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search titles…" className="h-10 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm sm:max-w-xs" />
      </div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(t=><article key={t.id} className="rounded-2xl border border-line bg-surface p-4">
        <div className="aspect-[2/3] rounded-xl border border-line bg-elevated grid place-items-center text-xs text-muted">{t.posterKey?"Artwork":"Poster"}</div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div><h3 className="font-display text-lg font-semibold">{t.name}</h3><p className="mt-1 text-xs text-muted">{t.language}{t.year?` · ${t.year}`:""}</p></div>
          <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold">{t.availableRights}</span>
        </div>
        <button onClick={()=>setSelected({id:t.id,name:t.name})} className="mt-4 w-full rounded-full bg-fg px-4 py-2.5 text-sm font-semibold text-bg">Request License</button>
      </article>)}
      {!rows.length?<div className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">No marketplace titles available.</div>:null}
    </section>
    {selected?<RequestPanel title={selected} onClose={()=>setSelected(null)} />:null}
  </div>;
}

function RequestPanel({title,onClose}:{title:{id:string;name:string};onClose:()=>void}){
  const qc=useQueryClient();
  const [territory,setTerritory]=useState("India");
  const [language,setLanguage]=useState("Malayalam");
  const [platform,setPlatform]=useState("OTT");
  const [window,setWindow]=useState("12 months");
  const [exclusivity,setExclusivity]=useState<"NON_EXCLUSIVE"|"EXCLUSIVE">("NON_EXCLUSIVE");
  const mut=useMutation({mutationFn:()=>createLicenseRequest({data:{titleId:title.id,territory,language,platform,window,exclusivity}}),onSuccess:()=>{void qc.invalidateQueries({queryKey:["bridge-marketplace-requests"]});}});
  return <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Request License</p><h3 className="mt-1 font-display text-xl font-semibold">{title.name}</h3></div><button onClick={onClose} className="text-sm text-muted">Close</button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Compact label="Territory" value={territory} set={setTerritory} />
      <Compact label="Language" value={language} set={setLanguage} />
      <Compact label="Platform" value={platform} set={setPlatform} />
      <Compact label="Window" value={window} set={setWindow} />
      <label className="text-xs text-muted">Exclusivity<select value={exclusivity} onChange={e=>setExclusivity(e.target.value as any)} className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg"><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select></label>
    </div>
    <div className="mt-4 flex items-center gap-3"><button disabled={mut.isPending} onClick={()=>mut.mutate()} className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">{mut.isPending?"Sending…":"Send Request"}</button>{mut.isSuccess?<span className="text-sm text-muted">Request received.</span>:null}{mut.isError?<span className="text-sm text-muted">{mut.error instanceof Error?mut.error.message:"Request failed"}</span>:null}</div>
  </section>;
}
function Compact({label,value,set}:{label:string;value:string;set:(v:string)=>void}){return <label className="text-xs text-muted">{label}<input value={value} onChange={e=>set(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg" /></label>;}
