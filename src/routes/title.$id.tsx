import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getTitle } from "@/lib/bridge/titles";
import { confirmAssetUpload, listTitleAssets, requestAssetDownload, requestAssetUpload } from "@/lib/bridge/assets";
import { getLoopPublication } from "@/lib/bridge/loop-publication";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const TABS = ["Overview","Files","Details","Rights","Delivery","Billing"] as const;
type Tab = (typeof TABS)[number];

function TitlePage() {
  const { id } = Route.useParams();
  return <RequireBridge>{(actor)=><BridgeShell actor={actor} title="Title Workspace"><TitleBody id={id} actor={actor} /></BridgeShell>}</RequireBridge>;
}

function TitleBody({ id, actor }: { id:string; actor:BridgeActor }) {
  const [tab,setTab]=useState<Tab>("Overview");
  const titleQ=useQuery({queryKey:["bridge-title",id],queryFn:()=>getTitle({data:{id}})});
  const assetsQ=useQuery({queryKey:["bridge-assets",id],queryFn:()=>listTitleAssets({data:{titleId:id}})});
  const pubQ=useQuery({queryKey:["loop-pub",id],queryFn:()=>getLoopPublication({data:{bridgeTitleId:id}})});
  const title=titleQ.data?.title; const assets=assetsQ.data?.assets??[]; const pub=pubQ.data?.publication;
  if(titleQ.isPending)return <p className="text-sm text-muted">Loading…</p>;
  if(!title)return <p className="text-sm text-muted">Title not found.</p>;
  const masterReady=Boolean(title.masterKey);
  const rightsReady=["LICENSING_READY","LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED","DELIVERED"].includes(title.status);
  const delivered=Boolean(pub?.authorizationStatus);

  return <div className="space-y-4">
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold sm:text-3xl">{title.name}</h2><p className="mt-1 text-xs text-muted">{title.language}{title.year?` · ${title.year}`:""}</p></div><span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">{title.status}</span></div>
    </section>
    <nav className="flex gap-1 overflow-x-auto border-b border-line pb-3">{TABS.map(x=><button key={x} onClick={()=>setTab(x)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${tab===x?"bg-fg font-semibold text-bg":"text-muted hover:bg-surface"}`}>{x}</button>)}</nav>
    {tab==="Overview"?<Overview assets={assets.length} masterReady={masterReady} rightsReady={rightsReady} delivered={delivered} openFiles={()=>setTab("Files")} />:
     tab==="Files"?<FilesPanel titleId={id} assets={assets} onAssetsChanged={()=>assetsQ.refetch()} />:
     <CompactPanel tab={tab} delivered={delivered} internal={Boolean(actor.internalRole)} />}
  </div>;
}

function Overview({assets,masterReady,rightsReady,delivered,openFiles}:{assets:number;masterReady:boolean;rightsReady:boolean;delivered:boolean;openFiles:()=>void}) {
 return <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Ready for OTT</p><h3 className="mt-1 font-display text-xl font-semibold">Complete only what is needed</h3></div><button onClick={openFiles} className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">{masterReady?"Manage Files":"Upload Master"}</button></div>
   <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Mini label="Files" value={assets?`${assets} added`:"Add files"} /><Mini label="Master" value={masterReady?"Ready":"Required"} /><Mini label="Rights" value={rightsReady?"Ready":"Pending"} /><Mini label="Delivery" value={delivered?"Authorized":"Pending"} /></div>
   <p className="mt-4 text-xs text-muted">Add the title information and assets viewers need. Bridge keeps QC, storage and authorization checks in the background.</p>
 </section>;
}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>}

function FilesPanel({titleId,assets,onAssetsChanged}:{titleId:string;assets:Array<{id:string;kind:string;contentType:string|null;byteSize:number|null;verified:boolean}>;onAssetsChanged:()=>Promise<unknown>|unknown}) {
 const [uploading,setUploading]=useState(false); const [message,setMessage]=useState<string|null>(null);
 async function upload(file:File){setUploading(true);setMessage("Uploading…");try{const signed=await requestAssetUpload({data:{titleId,kind:"master",filename:file.name,contentType:file.type||"application/octet-stream"}});const put=await fetch(signed.url,{method:signed.method,body:file,headers:{"content-type":file.type||"application/octet-stream"}});if(!put.ok)throw new Error(`Upload failed (${put.status})`);await confirmAssetUpload({data:{assetId:signed.assetId,expectedByteSize:file.size}});await onAssetsChanged();setMessage("Upload complete.");}catch(e){setMessage(e instanceof Error?e.message:"Upload failed");}finally{setUploading(false);}}
 async function download(id:string){const signed=await requestAssetDownload({data:{assetId:id}});window.location.assign(signed.url);}
 return <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display text-xl font-semibold">Files</h3><p className="mt-1 text-sm text-muted">Master video and OTT assets.</p></div><label className="cursor-pointer rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">{uploading?"Uploading…":"Upload Master"}<input className="sr-only" type="file" accept="video/*,.mxf,.mov,.mp4" disabled={uploading} onChange={e=>{const f=e.currentTarget.files?.[0];if(f)void upload(f);e.currentTarget.value="";}} /></label></div>{message?<p className="mt-3 text-xs text-muted">{message}</p>:null}<div className="mt-4 space-y-2">{assets.length?assets.map(a=><div key={a.id} className="flex items-center justify-between rounded-xl border border-line p-3"><div><p className="text-sm font-semibold">{a.kind}</p><p className="text-xs text-muted">{a.verified?"Ready":"Processing"}</p></div>{a.verified?<button onClick={()=>void download(a.id)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">Download</button>:null}</div>):<p className="text-sm text-muted">No files yet.</p>}</div></section>;
}
function CompactPanel({tab,delivered,internal}:{tab:Exclude<Tab,"Overview"|"Files">;delivered:boolean;internal:boolean}) {
 const copy={Details:"Title, year, runtime, synopsis, cast, director and artwork used by OTT destinations.",Rights:"Ownership, territories, languages and availability window.",Delivery:delivered?"Authorized for delivery.":"Review readiness and authorize a destination when requirements are complete.",Billing:"Commercial terms, revenue and settlements."}[tab];
 return <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="font-display text-xl font-semibold">{tab}</h3><p className="mt-2 max-w-2xl text-sm text-muted">{copy}</p>{tab==="Rights"||tab==="Delivery"||tab==="Billing"?<p className="mt-4 text-xs font-semibold text-muted">{internal?"Admin controls stay here when required.":"Bridge will ask only for information needed at this stage."}</p>:null}</section>;
}
