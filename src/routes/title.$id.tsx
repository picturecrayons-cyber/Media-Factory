import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getTitle } from "@/lib/bridge/titles";
import { confirmAssetUpload, listTitleAssets, requestAssetDownload, requestAssetUpload } from "@/lib/bridge/assets";
import { getLoopPublication } from "@/lib/bridge/loop-publication";
import type { BridgeActor } from "@/lib/bridge/session";
import { OTT_INGEST_SPEC, getOttIngestAccept, validateOttIngestFile } from "@/lib/bridge/ott-ingest-spec";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const WORKSPACE_TABS = ["Overview", "Files", "Business"] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => <BridgeShell actor={actor} title="Title Workspace"><TitleBody id={id} actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function TitleBody({ id, actor: _actor }: { id: string; actor: BridgeActor }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");

  const titleQ = useQuery({ queryKey: ["bridge-title", id], queryFn: () => getTitle({ data: { id } }) });
  const assetsQ = useQuery({ queryKey: ["bridge-assets", id], queryFn: () => listTitleAssets({ data: { titleId: id } }) });
  const pubQ = useQuery({ queryKey: ["loop-pub", id], queryFn: () => getLoopPublication({ data: { bridgeTitleId: id } }) });

  const title = titleQ.data?.title;
  const assets = assetsQ.data?.assets ?? [];
  const pub = pubQ.data?.publication;

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title workspace…</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

  const qcReady = Boolean(title.masterKey);
  const legalReady = ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status);
  const rightsReady = legalReady;
  const packageReady = Boolean(qcReady && legalReady);
  const distributionReady = Boolean(pub?.authorizationStatus);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          <div className="aspect-[2/3] overflow-hidden rounded-xl border border-line bg-elevated">
            <div className="grid h-full place-items-center px-4 text-center text-xs text-muted">{assets.some((asset) => asset.kind === "poster") ? "Artwork added" : "Artwork not added yet"}</div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Title</p>
                <h1 className="mt-1 font-display text-2xl font-semibold text-fg sm:text-3xl">{title.name}</h1>
                <p className="mt-1 text-sm text-muted">{title.language}{title.year ? ` · ${title.year}` : ""}{title.runtimeMinutes ? ` · ${title.runtimeMinutes} min` : ""}</p>
              </div>
              <span className="rounded-full border border-line bg-elevated px-3 py-1.5 text-xs font-semibold">{title.status}</span>
            </div>
            {title.synopsis ? <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{title.synopsis}</p> : null}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {title.credits?.some((c) => c.role === "Director") ? <span><span className="text-muted">Director</span> · {title.credits.filter((c) => c.role === "Director").map((c) => c.name).join(", ")}</span> : null}
              {title.credits?.some((c) => c.role === "Cast") ? <span><span className="text-muted">Cast</span> · {title.credits.filter((c) => c.role === "Cast").map((c) => c.name).join(", ")}</span> : null}
            </div>
            <div className="mt-5"><button type="button" onClick={() => setActiveTab("Files")} className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">Upload Files</button></div>
          </div>
        </div>
      </section>

      <nav aria-label="Title Workspace Sections" className="flex gap-1 overflow-x-auto border-b border-line pb-3">
        {WORKSPACE_TABS.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${activeTab === tab ? "bg-fg text-bg font-semibold" : "text-muted hover:bg-surface hover:text-fg"}`}>{tab}</button>)}
      </nav>

      {activeTab === "Overview" ? (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Overview</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Ready for market</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Files" value={assets.length ? "ADDED" : "ADD FILES"} />
            <Metric label="Rights" value={rightsReady ? "READY" : "PENDING"} />
            <Metric label="Delivery" value={distributionReady ? "AUTHORIZED" : packageReady ? "READY" : "PENDING"} />
            <Metric label="Revenue" value="—" />
          </div>
        </section>
      ) : activeTab === "Files" ? (
        <FilesPanel titleId={id} assets={assets} onAssetsChanged={() => assetsQ.refetch()} />
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Business</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <BusinessCard title="Rights" status={rightsReady ? "Ready" : "Pending"} copy="Ownership, territory, language and window checks remain enforced by Bridge." />
            <BusinessCard title="Agreement" status="Review" copy="Legal approvals stay admin-controlled and auditable." />
            <BusinessCard title="Licensing" status={["IN_NEGOTIATION","LICENSED"].includes(title.status) ? title.status.replaceAll("_"," ") : "Not started"} copy="Commercial terms open only when required." />
            <BusinessCard title="Delivery" status={distributionReady ? "Authorized" : "Pending"} copy={distributionReady ? "Approved for delivery." : "Delivery stays blocked until files, rights and commercial gates are clear."} />
            <BusinessCard title="Revenue" status="—" copy="Payment, ledger and settlement logic remains unchanged." />
          </div>
        </section>
      )}
    </div>
  );
}
function Metric({ label, value }: { label:string; value:string }) { return <div className="rounded-xl border border-line bg-elevated/40 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function BusinessCard({ title, status, copy }: { title:string; status:string; copy:string }) {
  return <div className="rounded-xl border border-line p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3><span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold">{status}</span></div><p className="mt-2 text-sm leading-6 text-muted">{copy}</p></div>;
}

type SimpleAssetKind = "master" | "poster" | "subtitle" | "screener" | "technical";
function FilesPanel({ titleId, assets, onAssetsChanged }: { titleId:string; assets:Array<{id:string;kind:string;contentType:string|null;byteSize:number|null;verified:boolean}>; onAssetsChanged:()=>Promise<unknown>|unknown }) {
 const [uploading,setUploading]=useState<SimpleAssetKind|null>(null); const [message,setMessage]=useState<string|null>(null);
 async function uploadFile(kind:SimpleAssetKind,file:File){const validation=validateOttIngestFile({kind,filename:file.name,contentType:file.type||"application/octet-stream"});if(!validation.ok){setMessage(validation.message);return;}setUploading(kind);setMessage(`Preparing ${kind} upload…`);try{const signed=await requestAssetUpload({data:{titleId,kind,filename:file.name,contentType:file.type||"application/octet-stream"}});const put=await fetch(signed.url,{method:signed.method,body:file,headers:{"content-type":file.type||"application/octet-stream"}});if(!put.ok)throw new Error(`Upload failed (${put.status})`);await confirmAssetUpload({data:{assetId:signed.assetId,expectedByteSize:file.size}});await onAssetsChanged();setMessage(`${kind[0].toUpperCase()+kind.slice(1)} is ready.`);}catch(error){setMessage(error instanceof Error?error.message:"Upload failed");}finally{setUploading(null);}}
 async function download(id:string){const signed=await requestAssetDownload({data:{assetId:id}});window.location.assign(signed.url);}
 const cards:[SimpleAssetKind,string,string][]=[["master","Master Video","Required"],["poster","Artwork","Add"],["subtitle","Subtitle","Optional"],["screener","Trailer / Screener","Optional"],["technical","Technical / Camera Package","Optional"]];
 return <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Files</p><h2 className="mt-1 font-display text-xl font-semibold">Upload OTT files</h2><p className="mt-2 text-sm text-muted">Choose the correct delivery format for each asset. Unsupported file types are blocked before upload.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{cards.map(([kind,label,empty])=><FileTypeCard key={kind} kind={kind} label={label} status={assets.some(a=>a.kind===kind)?"Ready":empty} busy={uploading===kind} onFile={(file)=>void uploadFile(kind,file)} />)}</div>{message?<p className="mt-3 text-xs text-muted">{message}</p>:null}<div className="mt-5 space-y-2">{assets.map(a=><div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4"><div><p className="text-sm font-semibold">{a.kind}</p><p className="text-xs text-muted">{a.verified?"Ready":"Processing"}</p></div>{a.verified?<button onClick={()=>void download(a.id)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">Download</button>:null}</div>)}</div></section>;
}
function FileTypeCard({ kind, label, status, busy, onFile }: { kind:SimpleAssetKind; label:string; status:string; busy:boolean; onFile:(file:File)=>void }) { const spec=OTT_INGEST_SPEC[kind]; return <div className="rounded-xl border border-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-muted">{status}</p><p className="mt-2 text-[11px] leading-5 text-muted">Allowed: {spec.extensions.map((ext)=>ext.replace(".","").toUpperCase()).join(", ")}</p></div><label className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold">{busy?"Uploading…":status==="Ready"?"Replace":"Upload"}<input className="sr-only" type="file" accept={getOttIngestAccept(kind)} disabled={busy} onChange={(e)=>{const file=e.currentTarget.files?.[0];if(file)onFile(file);e.currentTarget.value="";}} /></label></div></div>; }
