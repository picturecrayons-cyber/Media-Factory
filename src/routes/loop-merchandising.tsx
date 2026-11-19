import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getSuperAdminLoopMerchandising, saveSuperAdminLoopMerchandisingDraft, scheduleSuperAdminLoopMerchandising } from "@/lib/bridge/super-admin-loop-merchandising";

export const Route=createFileRoute("/loop-merchandising")({component:LoopMerchandising});
type Banner={id:string;title:string;subtitle:string;artworkUrl:string;destinationTitleId:string;sortOrder:number;enabled:boolean;publishAt:string|null;unpublishAt:string|null};
type Collection={id:string;title:string;description:string;titleIds:string[];sortOrder:number;enabled:boolean;publishAt:string|null;unpublishAt:string|null};
type Payload={hero:{title:string;subtitle:string;featuredTitleId:string|null};banners:Banner[];collections:Collection[]};
const empty:Payload={hero:{title:"",subtitle:"",featuredTitleId:null},banners:[],collections:[]};
function LoopMerchandising(){return <RequireBridge allow="super_admin">{actor=><BridgeShell actor={actor} title="Loop homepage merchandising"><MerchandisingBody/></BridgeShell>}</RequireBridge>}
function MerchandisingBody(){
 const qc=useQueryClient();
 const q=useQuery({queryKey:["super-admin-loop-merchandising"],queryFn:()=>getSuperAdminLoopMerchandising(),retry:false});
 const [payload,setPayload]=useState<Payload>(empty);
 const [publishAt,setPublishAt]=useState("");
 const [unpublishAt,setUnpublishAt]=useState("");
 const [message,setMessage]=useState<string|null>(null);
 useEffect(()=>{if(q.data?.document)setPayload(q.data.document.payload);},[q.data?.document?.version]);
 const save=useMutation({mutationFn:()=>saveSuperAdminLoopMerchandisingDraft({data:{expectedVersion:q.data?.document?.version??0,payload}}),onSuccess:async r=>{setMessage("Draft saved · version "+r.version);await qc.invalidateQueries({queryKey:["super-admin-loop-merchandising"]});}});
 const schedule=useMutation({mutationFn:()=>scheduleSuperAdminLoopMerchandising({data:{expectedVersion:q.data?.document?.version??0,publishAt:new Date(publishAt).toISOString(),unpublishAt:unpublishAt?new Date(unpublishAt).toISOString():null}}),onSuccess:async r=>{setMessage("Merchandising "+r.status.toLowerCase()+" · version "+r.version);await qc.invalidateQueries({queryKey:["super-admin-loop-merchandising"]});}});
 const enabled=q.data?.mutationsEnabled===true;
 const patchHero=(v:Partial<Payload["hero"]>)=>setPayload(p=>({...p,hero:{...p.hero,...v}}));
 return <div className="space-y-6">
  <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
   <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Loop CMS · draft and scheduling</p>
   <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Homepage merchandising</h2>
   <p className="mt-2 max-w-3xl text-sm text-muted">Edit the hero, promotional banners and curated collections. Every referenced title is checked against current Bridge publication authorization before save/schedule. This does not grant rights or publish an unapproved title.</p>
  </section>
  {q.isPending?<p className="rounded-xl border border-line p-5 text-sm text-muted">Loading merchandising document…</p>:q.isError?<p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">Merchandising storage is unavailable. The additive migration must be reviewed and applied in the approved STAGING gate before this editor can operate.</p>:<>
   <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
    <div><h3 className="font-semibold">Hero</h3><p className="text-xs text-muted">A featured title ID is optional. If supplied, Bridge authorization is validated.</p></div>
    <label className="block text-sm">Hero title<input value={payload.hero.title} maxLength={120} onChange={e=>patchHero({title:e.target.value})} className="mt-1 h-10 w-full rounded-lg border border-line bg-elevated px-3"/></label>
    <label className="block text-sm">Hero subtitle<textarea value={payload.hero.subtitle} maxLength={280} rows={3} onChange={e=>patchHero({subtitle:e.target.value})} className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2"/></label>
    <label className="block text-sm">Featured Loop title ID<input value={payload.hero.featuredTitleId??""} onChange={e=>patchHero({featuredTitleId:e.target.value||null})} placeholder="UUID from approved Loop title" className="mt-1 h-10 w-full rounded-lg border border-line bg-elevated px-3 font-mono text-xs"/></label>
   </section>
   <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Promotional banners</h3><p className="text-xs text-muted">Maximum 20; HTTPS artwork only.</p></div><button type="button" disabled={payload.banners.length>=20} onClick={()=>setPayload(p=>({...p,banners:[...p.banners,{id:crypto.randomUUID(),title:"",subtitle:"",artworkUrl:"",destinationTitleId:"",sortOrder:p.banners.length,enabled:true,publishAt:null,unpublishAt:null}]}))} className="rounded-full border border-line px-3 py-2 text-xs font-semibold disabled:opacity-40">Add banner</button></div>
    {payload.banners.map((b,i)=><article key={b.id} className="rounded-xl border border-line p-4 space-y-2">
     <div className="flex items-center justify-between"><p className="text-xs font-semibold">Banner {i+1}</p><button type="button" onClick={()=>setPayload(p=>({...p,banners:p.banners.filter(x=>x.id!==b.id)}))} className="text-xs text-muted">Remove</button></div>
     <input value={b.title} onChange={e=>setPayload(p=>({...p,banners:p.banners.map(x=>x.id===b.id?{...x,title:e.target.value}:x)}))} placeholder="Banner title" className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm"/>
     <input value={b.subtitle} onChange={e=>setPayload(p=>({...p,banners:p.banners.map(x=>x.id===b.id?{...x,subtitle:e.target.value}:x)}))} placeholder="Subtitle" className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm"/>
     <input value={b.artworkUrl} onChange={e=>setPayload(p=>({...p,banners:p.banners.map(x=>x.id===b.id?{...x,artworkUrl:e.target.value}:x)}))} placeholder="HTTPS artwork URL" className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm"/>
     <input value={b.destinationTitleId} onChange={e=>setPayload(p=>({...p,banners:p.banners.map(x=>x.id===b.id?{...x,destinationTitleId:e.target.value}:x)}))} placeholder="Authorized Loop title UUID" className="h-10 w-full rounded-lg border border-line bg-elevated px-3 font-mono text-xs"/>
     <label className="text-xs text-muted">Display order<input type="number" min={0} max={1000} value={b.sortOrder} onChange={e=>setPayload(p=>({...p,banners:p.banners.map(x=>x.id===b.id?{...x,sortOrder:Number(e.target.value)}:x)}))} className="mt-1 h-9 w-24 rounded-lg border border-line bg-elevated px-2"/></label>
     <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={b.enabled} onChange={e=>setPayload(p=>({...p,banners:p.banners.map(x=>x.id===b.id?{...x,enabled:e.target.checked}:x)}))}/>Enabled</label>
     <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-muted">Show from<input type="datetime-local" value={toLocalInput(b.publishAt)} onChange={e=>setPayload(p=>({...p,banners:p.banners.map(x=>x.id===b.id?{...x,publishAt:fromLocalInput(e.target.value)}:x)}))} className="mt-1 h-9 w-full rounded-lg border border-line bg-elevated px-2"/></label><label className="text-xs text-muted">Hide after<input type="datetime-local" value={toLocalInput(b.unpublishAt)} onChange={e=>setPayload(p=>({...p,banners:p.banners.map(x=>x.id===b.id?{...x,unpublishAt:fromLocalInput(e.target.value)}:x)}))} className="mt-1 h-9 w-full rounded-lg border border-line bg-elevated px-2"/></label></div>
    </article>)}
    {!payload.banners.length?<p className="text-sm text-muted">No banners configured.</p>:null}
   </section>
   <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Curated collections</h3><p className="text-xs text-muted">Maximum 30 collections; titles must be Bridge-authorized for Loop.</p></div><button type="button" disabled={payload.collections.length>=30} onClick={()=>setPayload(p=>({...p,collections:[...p.collections,{id:crypto.randomUUID(),title:"",description:"",titleIds:[],sortOrder:p.collections.length,enabled:true,publishAt:null,unpublishAt:null}]}))} className="rounded-full border border-line px-3 py-2 text-xs font-semibold disabled:opacity-40">Add collection</button></div>
    {payload.collections.map((c,i)=><article key={c.id} className="rounded-xl border border-line p-4 space-y-2">
     <div className="flex items-center justify-between"><p className="text-xs font-semibold">Collection {i+1}</p><button type="button" onClick={()=>setPayload(p=>({...p,collections:p.collections.filter(x=>x.id!==c.id)}))} className="text-xs text-muted">Remove</button></div>
     <input value={c.title} onChange={e=>setPayload(p=>({...p,collections:p.collections.map(x=>x.id===c.id?{...x,title:e.target.value}:x)}))} placeholder="Collection title" className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm"/>
     <input value={c.description} onChange={e=>setPayload(p=>({...p,collections:p.collections.map(x=>x.id===c.id?{...x,description:e.target.value}:x)}))} placeholder="Description" className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm"/>
     <textarea value={c.titleIds.join(", ")} onChange={e=>setPayload(p=>({...p,collections:p.collections.map(x=>x.id===c.id?{...x,titleIds:e.target.value.split(",").map(v=>v.trim()).filter(Boolean)}:x)}))} placeholder="Comma-separated authorized Loop title UUIDs" rows={2} className="w-full rounded-lg border border-line bg-elevated px-3 py-2 font-mono text-xs"/>
     <label className="text-xs text-muted">Display order<input type="number" min={0} max={1000} value={c.sortOrder} onChange={e=>setPayload(p=>({...p,collections:p.collections.map(x=>x.id===c.id?{...x,sortOrder:Number(e.target.value)}:x)}))} className="mt-1 h-9 w-24 rounded-lg border border-line bg-elevated px-2"/></label>
     <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.enabled} onChange={e=>setPayload(p=>({...p,collections:p.collections.map(x=>x.id===c.id?{...x,enabled:e.target.checked}:x)}))}/>Enabled</label>
     <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-muted">Show from<input type="datetime-local" value={toLocalInput(c.publishAt)} onChange={e=>setPayload(p=>({...p,collections:p.collections.map(x=>x.id===c.id?{...x,publishAt:fromLocalInput(e.target.value)}:x)}))} className="mt-1 h-9 w-full rounded-lg border border-line bg-elevated px-2"/></label><label className="text-xs text-muted">Hide after<input type="datetime-local" value={toLocalInput(c.unpublishAt)} onChange={e=>setPayload(p=>({...p,collections:p.collections.map(x=>x.id===c.id?{...x,unpublishAt:fromLocalInput(e.target.value)}:x)}))} className="mt-1 h-9 w-full rounded-lg border border-line bg-elevated px-2"/></label></div>
    </article>)}
    {!payload.collections.length?<p className="text-sm text-muted">No collections configured.</p>:null}
   </section>
   <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
    <div><h3 className="font-semibold">Publish schedule</h3><p className="text-xs text-muted">Future schedules become publicly readable only inside the configured window. This does not override title-level rights windows.</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Publish at<input type="datetime-local" value={publishAt} onChange={e=>setPublishAt(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-elevated px-3"/></label><label className="text-sm">Unpublish at (optional)<input type="datetime-local" value={unpublishAt} onChange={e=>setUnpublishAt(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-elevated px-3"/></label></div>
    <p className="text-xs text-muted">Current document: {q.data.document?.status??"No draft"} · version {q.data.document?.version??0}</p>
    {!enabled?<p className="rounded-lg border border-line p-3 text-xs text-muted">Save and schedule actions are disabled by default. They require the additive migration and a separately approved Preview-only feature flag.</p>:null}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={!enabled||save.isPending} onClick={()=>save.mutate()} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">{save.isPending?"Saving…":"Save draft"}</button><button type="button" disabled={!enabled||!q.data.document||!publishAt||schedule.isPending} onClick={()=>schedule.mutate()} className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">{schedule.isPending?"Scheduling…":"Schedule / publish"}</button></div>
    {message?<p role="status" className="text-sm text-muted">{message}</p>:null}
    {save.isError||schedule.isError?<p role="alert" className="text-sm text-accent">{(save.error??schedule.error) instanceof Error?(save.error??schedule.error)?.message:"Merchandising action failed"}</p>:null}
   </section>
  </>}
 </div>;
}

function toLocalInput(value:string|null){
 if(!value) return "";
 const date=new Date(value);
 return Number.isNaN(date.getTime())?"":new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function fromLocalInput(value:string){
 return value?new Date(value).toISOString():null;
}
