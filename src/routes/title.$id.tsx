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

const WORKSPACE_TABS = ["Overview", "Files", "Metadata", "QC", "Rights", "Licensing", "Delivery", "Team", "Billing"] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => <BridgeShell actor={actor} title="Title Workspace"><TitleBody id={id} actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function TitleBody({ id, actor }: { id: string; actor: BridgeActor }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");

  const titleQ = useQuery({ queryKey: ["bridge-title", id], queryFn: () => getTitle({ data: { id } }) });
  const assetsQ = useQuery({ queryKey: ["bridge-assets", id], queryFn: () => listTitleAssets({ data: { titleId: id } }) });
  const pubQ = useQuery({ queryKey: ["loop-pub", id], queryFn: () => getLoopPublication({ data: { bridgeTitleId: id } }) });

  const title = titleQ.data?.title;
  const assets = assetsQ.data?.assets ?? [];
  const pub = pubQ.data?.publication;

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title workspace…</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

  const ingestReady = assets.length > 0;
  const qcReady = Boolean(title.masterKey);
  const legalReady = ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status);
  const rightsReady = legalReady;
  const packageReady = Boolean(qcReady && legalReady);
  const distributionReady = Boolean(pub?.authorizationStatus);
  const pipelineStep = !ingestReady ? 1 : !qcReady ? 2 : !rightsReady ? 3 : !packageReady ? 4 : 5;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Canonical Title</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-fg sm:text-3xl">{title.name}</h1>
            <p className="mt-1 text-xs text-muted">{title.language}{title.year ? ` · ${title.year}` : ""} · <span className="font-mono">{title.id}</span></p>
          </div>
          <span className="rounded-full border border-line bg-elevated px-3 py-1.5 text-xs font-semibold">{title.status}</span>
        </div>
      </section>

      <nav aria-label="Title Workspace Sections" className="flex gap-1 overflow-x-auto border-b border-line pb-3">
        {WORKSPACE_TABS.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${activeTab === tab ? "bg-fg text-bg font-semibold" : "text-muted hover:bg-surface hover:text-fg"}`}>{tab}</button>)}
      </nav>

      {activeTab === "Overview" ? (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Progress</p><h2 className="mt-1 font-display text-xl font-semibold">Content to market</h2></div>
            {!ingestReady ? <button type="button" onClick={() => setActiveTab("Files")} className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">Upload Master Film</button> : null}
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-5">{["Prepare","QC","Rights","Licensing","Delivery"].map((label,index)=><PipelineStep key={label} n={index+1} label={label} state={index+1 < pipelineStep ? "done" : index+1 === pipelineStep ? "current" : "todo"} />)}</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Assets" value={String(assets.length)} /><Metric label="Master" value={title.masterKey ? "VERIFIED" : "REQUIRED"} /><Metric label="Rights" value={rightsReady ? "READY" : "PENDING"} /><Metric label="Delivery" value={distributionReady ? "AUTHORIZED" : packageReady ? "READY" : "PENDING"} />
          </div>
        </section>
      ) : activeTab === "Files" ? (
        <FilesPanel titleId={id} assets={assets} onAssetsChanged={() => assetsQ.refetch()} />
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{activeTab}</p>
          <h2 className="mt-1 font-display text-xl font-semibold">{tabHeading(activeTab)}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{tabCopy(activeTab, distributionReady, pub?.authorizationStatus)}</p>
        </section>
      )}
    </div>
  );
}
function PipelineStep({ n, label, state }: { n:number; label:string; state:"done"|"current"|"todo" }) {
  return <div className={`rounded-xl border p-3 ${state==="current"?"border-fg bg-elevated":"border-line"}`}><p className="text-[10px] font-semibold tracking-wider text-muted">{String(n).padStart(2,"0")} · {label.toUpperCase()}</p><p className="mt-1 text-xs font-semibold">{state==="done"?"Complete":state==="current"?"Current":"Not started"}</p></div>;
}
function Metric({ label, value }: { label:string; value:string }) { return <div className="rounded-xl border border-line bg-elevated/40 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }

function FilesPanel({ titleId, assets, onAssetsChanged }: { titleId:string; assets:Array<{id:string;kind:string;contentType:string|null;byteSize:number|null;verified:boolean}>; onAssetsChanged:()=>Promise<unknown>|unknown }) {
 const [uploading,setUploading]=useState(false); const [message,setMessage]=useState<string|null>(null);
 async function uploadFile(file:File){setUploading(true);setMessage("Preparing secure upload…");try{const signed=await requestAssetUpload({data:{titleId,kind:"master",filename:file.name,contentType:file.type||"application/octet-stream"}});const put=await fetch(signed.url,{method:signed.method,body:file,headers:{"content-type":file.type||"application/octet-stream"}});if(!put.ok)throw new Error(`Upload failed (${put.status})`);await confirmAssetUpload({data:{assetId:signed.assetId,expectedByteSize:file.size}});await onAssetsChanged();setMessage("Master verified and sealed.");}catch(error){setMessage(error instanceof Error?error.message:"Upload failed");}finally{setUploading(false);}}
 async function download(id:string){const signed=await requestAssetDownload({data:{assetId:id}});window.location.assign(signed.url);}
 return <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Files</p><h2 className="mt-1 font-display text-xl font-semibold">Assets</h2><p className="mt-2 text-sm text-muted">Master video and supporting assets remain in the existing private Bridge storage flow.</p><label className="mt-5 inline-flex cursor-pointer rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">{uploading?"Uploading…":"Upload Master Film"}<input className="sr-only" type="file" accept="video/*,.mxf,.mov,.mp4" disabled={uploading} onChange={(e)=>{const file=e.currentTarget.files?.[0];if(file)void uploadFile(file);e.currentTarget.value="";}} /></label>{message?<p className="mt-3 text-xs text-muted">{message}</p>:null}<div className="mt-5 space-y-2">{assets.map(a=><div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4"><div><p className="text-sm font-semibold">{a.kind}</p><p className="text-xs text-muted">{a.verified?"Verified":"Processing"}{a.byteSize?` · ${a.byteSize.toLocaleString()} bytes`:""}</p></div>{a.verified?<button onClick={()=>void download(a.id)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">Download</button>:null}</div>)}</div></section>;
}
function tabHeading(tab:WorkspaceTab){const m:Record<WorkspaceTab,string>={Overview:"Content to market",Files:"Assets",Metadata:"Title metadata",QC:"Technical QC",Rights:"Rights & avails",Licensing:"Licensing",Delivery:"Delivery",Team:"Team access",Billing:"Billing & settlement"};return m[tab];}
function tabCopy(tab:WorkspaceTab, delivered:boolean, loop?:string|null){const m:Record<WorkspaceTab,string>={Overview:"",Files:"",Metadata:"Canonical title and descriptive metadata.",QC:"Technical review and repair status for the title package.",Rights:"Ownership, territory, language, media, window and restrictions remain controlled by Bridge.",Licensing:"Contract-backed commercial grants and licensing status.",Delivery:delivered?`Delivery is authorized${loop?` · ${loop}`:""}.`:"Delivery activates only after required preparation, QC, rights and licensing gates.",Team:"Workspace participants and access for this title.",Billing:"Commercial and settlement information for this title."};return m[tab];}
