import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StoryConceptDesk } from "@/components/bridge/story-concept-desk";
import { hasPermission } from "@/lib/bridge/rbac";
import type { BridgeActor } from "@/lib/bridge/session";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";
import { listDuplicateReviews, openDuplicateReview, decideDuplicateReview } from "@/lib/bridge/duplicate-reconciliation";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "Concepts", "QC", "Rights", "Assets", "Buyers", "Deliveries", "Audit"] as const;
type Tab = (typeof TABS)[number];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", UPLOADING: "Uploading", PREPARING: "Preparing", QC_REVIEW: "QC Review",
  RIGHTS_REVIEW: "Rights Review", LICENSING_READY: "Licensing Ready", LIVE_FOR_BUYERS: "Live for Buyers",
  IN_NEGOTIATION: "In Negotiation", LICENSED: "Licensed", DELIVERED: "Delivered",
};

type GateState = "PASSED" | "PENDING" | "BLOCKED" | "FAILED";
function gateState(passed: boolean, blocked = false): GateState {
  return passed ? "PASSED" : blocked ? "BLOCKED" : "PENDING";
}
function labelForState(state: GateState) {
  return state === "PASSED" ? "Passed" : state === "FAILED" ? "Failed" : state === "BLOCKED" ? "Blocked" : "Pending evidence";
}
function fileSize(value: unknown) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unverified";
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " bytes";
}
function dateLabel(value: unknown) {
  if (!value) return "Not recorded";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Invalid date" : date.toLocaleDateString();
}
function hasEvidence(value: unknown) {
  if (typeof value === "string") return value.trim().length >= 3;
  if (Array.isArray(value)) return value.some((entry) => hasEvidence(entry));
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some((entry) => hasEvidence(entry));
  return false;
}
function rightsEvidenceReferences(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    return Object.entries(entry as Record<string, unknown>).some(([key, child]) =>
      /(agreement|ownership|authorization|producer|chain|document|evidence)/i.test(key) &&
      typeof child === "string" && child.trim().length >= 3,
    );
  });
}

function AdminWorkstations() {
  return (
    <RequireBridge allow="internal">
      {(actor) => <BridgeShell actor={actor} title="Admin"><WorkstationBody actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function WorkstationBody({ actor }: { actor: BridgeActor }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-workstations"], queryFn: () => listAdminWorkstations() });
  const review = useMutation({
    mutationFn: reviewAdminTitle,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const gate = useMutation({
    mutationFn: setBuyerPublicationGate,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const [activeTab, setActiveTab] = useState<Tab>("Titles");
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null);
  const data = query.data;

  if (query.isLoading) return <div className="p-8 text-sm text-muted">Loading Admin…</div>;
  if (query.isError || !data) return <div className="rounded-2xl border border-line bg-surface p-8 text-sm">Unable to load the Bridge operational backend.</div>;

  const titleName = new Map(data.titles.map((title: any) => [title.id, title.name]));
  const qcQueue = data.titles.filter((title: any) => title.status === "QC_REVIEW");
  const rightsQueue = data.titles.filter((title: any) => title.status === "RIGHTS_REVIEW");
  const commercial = data.titles.filter((title: any) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status));
  const selectedTitle = selectedTitleId ? data.titles.find((title: any) => title.id === selectedTitleId) : null;
  const error = review.error ?? gate.error;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bridge Admin · Certification</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold">Review each title. Verify every gate.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">An asset record is not a QC pass. A rights draft is not legal clearance. Buyer visibility remains fail-closed until all required evidence gates are satisfied.</p>
          </div>
          <Link to="/admin" className="text-sm text-accent hover:underline">← Admin overview</Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Titles in queue" value={data.titles.length} />
          <Metric label="QC review" value={qcQueue.length} />
          <Metric label="Rights review" value={rightsQueue.length} />
          <Metric label="Commercial pipeline" value={commercial.length} />
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto border-b border-line pb-2" aria-label="Admin workstations">
        {TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} aria-current={activeTab === tab ? "page" : undefined}
            className={"whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition " + (activeTab === tab ? "bg-fg text-bg" : "border border-line bg-surface text-muted hover:text-fg")}>
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Titles" ? (
        <TitleQueue titles={data.titles} assets={data.assets} qcCases={data.qc} legalCases={data.legal} rights={data.rights}
          packages={data.packages} gates={data.gateCertifications ?? []} onSelect={setSelectedTitleId} />
      ) : activeTab === "Concepts" ? (
        <StoryConceptDesk />
      ) : activeTab === "QC" ? (
        <Queue titles={qcQueue} title="QC Review" description="Open the title checklist, inspect actual asset verification and record technical findings."
          onSelect={setSelectedTitleId} />
      ) : activeTab === "Rights" ? (
        <Queue titles={rightsQueue} title="Legal & Rights Review" description="Select a specific rights draft and verify supporting documents, scope and dates before legal approval."
          onSelect={setSelectedTitleId} />
      ) : activeTab === "Assets" ? (
        <AssetRegister assets={data.assets} titleName={titleName} versions={data.assetVersions} />
      ) : activeTab === "Buyers" ? (
        <BuyerRelease titles={data.titles} canApprove={hasPermission(actor, "title.approve")}
          gates={data.gateCertifications ?? []}
          onGate={(titleId, gateName) => gate.mutate({ data: { titleId, gate: gateName as "OTT", decision: "PASS", notes: "Reviewed in Admin certification workspace" } })} />
      ) : activeTab === "Deliveries" ? (
        <div className="space-y-6">
          <SimpleTable title="Licensing & Delivery" description={commercial.length + " titles in the commercial pipeline"}
            rows={commercial} fields={["name", "status", "language", "licensing_fee_paise", "updated_at"]} />
          <SimpleTable title="Destination Packages" description={data.packages.length + " persisted packages"}
            rows={data.packages} fields={["destination", "package_version", "readiness_state", "commercial_model", "authorized_at"]} />
          <SimpleTable title="Bridge Publications" description={data.publications.length + " persisted authorization records"}
            rows={data.publications} titleName={titleName} fields={["bridge_title_id", "authorization_status", "territories", "languages", "window_end"]} />
        </div>
      ) : (
        <SimpleTable title="Audit History" description="Persisted operator activity. No UI-only decisions."
          rows={data.audit} fields={["action", "entity_type", "entity_id", "actor_user_id", "created_at"]} />
      )}

      {error ? <p role="alert" className="rounded-xl border border-line p-4 text-sm">Action failed: {String(error)}</p> : null}
      {selectedTitle ? (
        <CertificationPanel title={selectedTitle} data={data} actor={actor}
          review={review} gate={gate} onClose={() => setSelectedTitleId(null)} />
      ) : null}
    </div>
  );
}

function Metric({label,value}:{label:string;value:number}) {
  return <div className="rounded-2xl border border-line p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>;
}
function SectionHeader({ title, description }: { title: string; description: string }) {
  return <div><h3 className="font-display text-2xl font-semibold">{title}</h3><p className="text-sm text-muted">{description}</p></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">{text}</div>;
}
function StatePill({state}:{state:GateState}) {
  const styles:Record<GateState,string>={PASSED:"border-emerald-700/30 bg-emerald-500/10 text-emerald-700",PENDING:"border-line bg-surface text-muted",BLOCKED:"border-amber-700/30 bg-amber-500/10 text-amber-800",FAILED:"border-red-700/30 bg-red-500/10 text-red-700"};
  return <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-medium "+styles[state]}>{labelForState(state)}</span>;
}
function RecordTable({ rows, fields, titleName }: { rows: any[]; fields: string[]; titleName: Map<any, any> }) {
  if (!rows.length) return <Empty text="No persisted records." />;
  return <div className="overflow-x-auto rounded-2xl border border-line"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr>{fields.map(field=><th key={field} className="px-3 py-3">{field.replaceAll("_"," ")}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.slice(0,50).map((row:any,index:number)=><tr key={String(row.id ?? row.user_id ?? index)}>{fields.map(field=><td key={field} className="max-w-[320px] truncate px-3 py-3">{field==="title_id" ? (titleName.get(row[field]) ?? row[field]) : typeof row[field] === "object" ? JSON.stringify(row[field]) : String(row[field] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}
function SimpleTable({ title, description, rows, fields, titleName }: { title: string; description: string; rows: any[]; fields: string[]; titleName?: Map<any, any> }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} /><RecordTable rows={rows} fields={fields} titleName={titleName ?? new Map()} /></section>;
}

function TitleQueue({titles,assets,qcCases,legalCases,rights,packages,gates,onSelect}:{
  titles:any[];assets:any[];qcCases:any[];legalCases:any[];rights:any[];packages:any[];gates:any[];onSelect:(id:string)=>void
}) {
  return <section className="space-y-3">
    <SectionHeader title="Title certification queue" description="Select a title to review its metadata, files, QC, rights, legal evidence and release gates in one workspace." />
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {titles.length ? titles.slice(0,150).map((title:any)=>{
        const titleAssets=assets.filter((asset:any)=>asset.title_id===title.id);
        const verifiedAssets=titleAssets.filter((asset:any)=>Number(asset.byte_size)>0).length;
        const passedQc=qcCases.some((entry:any)=>entry.title_id===title.id && entry.status==="PASSED");
        const approvedLegal=legalCases.some((entry:any)=>entry.title_id===title.id && entry.status==="APPROVED");
        const validRights=rights.some((entry:any)=>entry.title_id===title.id && entry.status==="VALID");
        const packageReady=packages.some((entry:any)=>entry.title_id===title.id && ["READY","AUTHORIZED","DELIVERED"].includes(entry.readiness_state));
        const gate=gates.find((entry:any)=>entry.title_id===title.id);
        const passCount=[passedQc,approvedLegal,validRights,packageReady,gate?.ott_preparation_status==="READY",gate?.packaging_status==="COMPLETE",gate?.curation_status==="APPROVED",gate?.delivery_status==="READY"].filter(Boolean).length;
        return <button type="button" key={title.id} onClick={()=>onSelect(title.id)} className="grid w-full gap-3 border-b border-line p-4 text-left transition hover:bg-elevated sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <span><span className="block font-medium">{title.name}</span><span className="mt-1 block text-xs text-muted">{STATUS_LABELS[title.status]??title.status} · {title.language} · {verifiedAssets}/{titleAssets.length} assets verified · {passCount}/8 release checks</span></span>
          <span className="flex items-center gap-2"><StatePill state={gateState(passCount===8)} /><span className="text-xs text-accent">Open checklist →</span></span>
        </button>;
      }):<Empty text="No titles in the Bridge catalog."/>}
    </div>
  </section>;
}

function Queue({titles,title,description,onSelect}:{titles:any[];title:string;description:string;onSelect:(id:string)=>void}) {
  return <section className="space-y-3"><SectionHeader title={title} description={description}/>{titles.length?titles.map((item:any)=><div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted">{STATUS_LABELS[item.status]??item.status} · {item.language}</p></div><Button size="sm" variant="outline" onClick={()=>onSelect(item.id)}>Open checklist</Button></div>):<Empty text="Queue is clear."/>}</section>;
}

function CertificationPanel({title,data,actor,review,gate,onClose}:{
  title:any;data:any;actor:BridgeActor;review:any;gate:any;onClose:()=>void
}) {
  const assets=data.assets.filter((asset:any)=>asset.title_id===title.id);
  const versions=data.assetVersions.filter((asset:any)=>asset.title_id===title.id);
  const qcCases=data.qc.filter((entry:any)=>entry.title_id===title.id);
  const legalCases=data.legal.filter((entry:any)=>entry.title_id===title.id);
  const rights=data.rights.filter((entry:any)=>entry.title_id===title.id);
  const packages=data.packages.filter((entry:any)=>entry.title_id===title.id);
  const publications=data.publications.filter((entry:any)=>entry.bridge_title_id===title.id);
  const productionAssets=(data.productionAssets??[]).filter((entry:any)=>entry.title_id===title.id);
  const gateCert=(data.gateCertifications??[]).find((entry:any)=>entry.title_id===title.id);
  const events=(data.titleEvents??[]).filter((entry:any)=>entry.title_id===title.id);
  const verifiedAssets=assets.filter((asset:any)=>Number(asset.byte_size)>0);
  const pendingAssets=assets.filter((asset:any)=>!(Number(asset.byte_size)>0));
  const latestQc=qcCases[0];
  const latestLegal=legalCases[0];
  const hasPassedQc=qcCases.some((entry:any)=>entry.status==="PASSED");
  const validGrant=rights.find((entry:any)=>entry.status==="VALID" && new Date(entry.window_start).getTime()<=Date.now() && new Date(entry.window_end).getTime()>Date.now() && rightsEvidenceReferences(entry.evidence));
  const allReleaseGates=[
    hasPassedQc, Boolean(latestLegal?.status==="APPROVED" && validGrant),
    gateCert?.ott_preparation_status==="READY",gateCert?.packaging_status==="COMPLETE",
    gateCert?.curation_status==="APPROVED",gateCert?.delivery_status==="READY",
    packages.some((p:any)=>["READY","AUTHORIZED","DELIVERED"].includes(p.readiness_state)),
  ];
  const releaseCount=allReleaseGates.filter(Boolean).length;
  const [grantId,setGrantId]=useState("");
  const [note,setNote]=useState("");
  const [qcNote,setQcNote]=useState("");
  const canQC=hasPermission(actor,"title.qc_review");
  const canLegal=hasPermission(actor,"title.rights_review");
  const canFinal=hasPermission(actor,"title.approve");

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="cert-title">
    <section className="mx-auto max-w-5xl space-y-5 rounded-3xl border border-line bg-surface p-5 shadow-2xl sm:p-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs uppercase tracking-widest text-accent">Title certification</p><h3 id="cert-title" className="mt-1 font-display text-2xl font-semibold">{title.name}</h3><p className="mt-1 text-xs text-muted">{title.year??"Year not recorded"} · {title.language} · {title.runtime_minutes??"Runtime not recorded"} min · {STATUS_LABELS[title.status]??title.status}</p></div>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Verified upload records" value={verifiedAssets.length}/>
        <Metric label="Asset versions / tracks" value={versions.length}/>
        <Metric label="Rights grant drafts" value={rights.filter((r:any)=>r.status==="DRAFT").length}/>
        <Metric label="Release checks" value={releaseCount+"/7"}/>
      </div>

      <section className="space-y-3">
        <SectionHeader title="1 · Metadata" description="Check title identity before reviewing media or documents."/>
        <div className="grid gap-2 rounded-2xl border border-line p-4 text-sm sm:grid-cols-3">
          <Info label="Original title" value={title.original_title??title.name}/>
          <Info label="Year" value={title.year}/>
          <Info label="Runtime" value={title.runtime_minutes?title.runtime_minutes+" min":null}/>
          <Info label="Original language" value={title.original_language??title.language}/>
          <Info label="Country of origin" value={title.country_of_origin}/>
          <Info label="Release date" value={dateLabel(title.release_date)}/>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="2 · Asset verification" description="A file row is verified only when byte size is persisted after object verification. Playback and content inspection require a separate human/technical QC finding."/>
        {assets.length? <div className="overflow-x-auto rounded-2xl border border-line"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">Asset</th><th className="p-3">Upload</th><th className="p-3">Size</th><th className="p-3">Type</th></tr></thead><tbody className="divide-y divide-line">{assets.map((asset:any)=><tr key={asset.id}><td className="p-3">{asset.kind}</td><td className="p-3"><StatePill state={Number(asset.byte_size)>0?"PASSED":"BLOCKED"}/></td><td className="p-3">{fileSize(asset.byte_size)}</td><td className="p-3 text-xs text-muted">{asset.content_type??"Not recorded"}</td></tr>)}</tbody></table></div>:<Empty text="No asset records linked to this title."/>}
        <div className="grid gap-2 sm:grid-cols-2"><Info label="Unverified / incomplete upload records" value={pendingAssets.length}/><Info label="Production register entries" value={productionAssets.length}/></div>
        {pendingAssets.length?<p className="text-sm text-amber-700">At least one asset row has no confirmed byte size. It must be re-uploaded or verified before the asset gate can pass.</p>:assets.length>0?<p className="text-sm text-muted">All listed upload rows have confirmed bytes. This is only storage verification; playback, version identity, audio and subtitle synchronisation remain separate QC checks.</p>:null}
        {versions.length? <SimpleTable title="Technical asset versions" description="Persisted codec/language/processing evidence" rows={versions} fields={["asset_group","asset_type","version","language","codec","processing_state"]}/>:<p className="rounded-xl border border-line p-3 text-sm text-muted">No versioned media or audio track records found. Audio, codec, channel layout and subtitle synchronization are not independently recorded.</p>}
      </section>

      <section className="space-y-3">
        <SectionHeader title="3 · Technical QC" description="A prior note is shown as reviewer evidence, not automatically treated as a complete QC certificate."/>
        {latestQc?<div className="rounded-2xl border border-line p-4 text-sm"><div className="flex items-center justify-between"><strong>{latestQc.status}</strong><span className="text-xs text-muted">{dateLabel(latestQc.reviewed_at)}</span></div><p className="mt-2">{Array.isArray(latestQc.reviewer_findings)?latestQc.reviewer_findings.map((f:any)=>f.note).filter(Boolean).join(" · "):"No reviewer findings recorded."}</p><p className="mt-2 text-xs text-muted">Reviewer: {latestQc.reviewed_by??"Not recorded"}</p></div>:<Empty text="No persisted QC report."/>}
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {["Master playback and correct version","Video codec, frame rate and resolution","Audio codec, channels and sync","Subtitle correctness and synchronization","Poster and trailer identity","Censor certificate readability and title match"].map((item:string)=><div key={item} className="rounded-xl border border-line p-3">{item}<p className="mt-1 text-xs text-muted">Needs reviewer evidence</p></div>)}
        </div>
        {canQC && title.status==="QC_REVIEW"?<div className="space-y-2 rounded-2xl border border-line p-4"><label className="text-sm font-medium" htmlFor="qc-notes">QC findings and evidence</label><textarea id="qc-notes" className="min-h-24 w-full rounded-xl border border-line bg-bg p-3 text-sm" value={qcNote} onChange={(event)=>setQcNote(event.target.value)} placeholder="Record master/version, playback result, video/audio checks, subtitle result, artwork and document findings (minimum 8 characters)."/><Button disabled={review.isPending||qcNote.trim().length<8} onClick={()=>review.mutate({data:{titleId:title.id,decision:"PASS",notes:qcNote}})}>Record QC pass</Button><Button variant="outline" disabled={review.isPending||qcNote.trim().length<8} onClick={()=>review.mutate({data:{titleId:title.id,decision:"FAIL",notes:qcNote}})}>Record QC issue</Button></div>:null}
      </section>

      <section className="space-y-3">
        <SectionHeader title="4 · Legal & rights verification" description="Only a selected DRAFT can be reviewed. Approval requires evidence reference, explicit scope, reviewer separation and an active rights period."/>
        <div className="rounded-2xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{rights.length} rights grant records</strong><span className="text-xs text-muted">{rights.filter((r:any)=>r.status==="VALID").length} valid · {rights.filter((r:any)=>r.status==="DRAFT").length} draft</span></div>
          {rights.length?<div className="mt-3 space-y-2">{rights.slice(0,30).map((r:any)=><div key={r.id} className="grid gap-2 rounded-xl border border-line p-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"><div><strong>{r.grant_type} · {r.status}</strong><p className="mt-1 text-muted">{(r.territories??[]).join(", ")||"No territory"} · {(r.languages??[]).join(", ")||"No language"} · {(r.media??[]).join(", ")||"No media"}</p><p className="mt-1 text-muted">{dateLabel(r.window_start)} → {dateLabel(r.window_end)} · {r.exclusivity??"Exclusivity missing"}</p><p className="mt-1 text-muted">Evidence reference: {rightsEvidenceReferences(r.evidence)?"Present":"Not found"} · Creator: {r.created_by??"Unknown"}</p></div><span className="text-muted">{r.id.slice(0,8)}…</span></div>)}</div>:<Empty text="No rights grant records."/>}
        </div>
        <div className="grid gap-2 rounded-2xl border border-line p-4 text-sm sm:grid-cols-2">
          <Info label="Legal cases" value={legalCases.length}/>
          <Info label="Latest legal decision" value={latestLegal?.status??"Not reviewed"}/>
          <Info label="Producer/chain-of-title evidence" value={legalCases.some((l:any)=>hasEvidence(l.evidence))?"Legal case evidence exists":"Not verified"}/>
          <Info label="Destination packages" value={packages.length}/>
        </div>
        {canLegal && title.status==="RIGHTS_REVIEW"?<div className="space-y-3 rounded-2xl border border-line p-4">
          <label className="block text-sm font-medium" htmlFor="rights-grant">Select one specific rights draft</label>
          <select id="rights-grant" className="w-full rounded-xl border border-line bg-bg p-3 text-sm" value={grantId} onChange={(event)=>setGrantId(event.target.value)}>
            <option value="">Choose rights draft…</option>{rights.filter((r:any)=>r.status==="DRAFT").map((r:any)=><option key={r.id} value={r.id}>{r.grant_type} · {(r.territories??[]).join(", ")||"No territory"} · {r.id.slice(0,8)}</option>)}
          </select>
          <label className="block text-sm font-medium" htmlFor="legal-notes">Legal findings and evidence reviewed</label>
          <textarea id="legal-notes" className="min-h-24 w-full rounded-xl border border-line bg-bg p-3 text-sm" value={note} onChange={(event)=>setNote(event.target.value)} placeholder="List producer declaration, agreement/chain-of-title reference, rights owned, excluded rights, territory, language, platform, period and exclusivity."/>
          <div className="flex flex-wrap gap-2"><Button disabled={!grantId||note.trim().length<8||review.isPending} onClick={()=>review.mutate({data:{titleId:title.id,decision:"APPROVE",grantId,notes:note}})}>Approve selected rights draft</Button><Button variant="outline" disabled={!grantId||note.trim().length<8||review.isPending} onClick={()=>review.mutate({data:{titleId:title.id,decision:"REJECT",grantId,notes:note}})}>Reject selected draft</Button></div>
        </div>:null}
      </section>

      <section className="space-y-3">
        <SectionHeader title="5 · Buyer and distribution gates" description="Buyer visibility uses the existing six-gate database check; this panel only reports persisted states."/>
        <div className="grid gap-2 sm:grid-cols-2">
          <GateRow label="QC passed" passed={hasPassedQc}/>
          <GateRow label="Legal approved + active grant" passed={Boolean(latestLegal?.status==="APPROVED"&&validGrant)}/>
          <GateRow label="OTT preparation" passed={gateCert?.ott_preparation_status==="READY"}/>
          <GateRow label="Packaging" passed={gateCert?.packaging_status==="COMPLETE"}/>
          <GateRow label="Curation" passed={gateCert?.curation_status==="APPROVED"}/>
          <GateRow label="Delivery" passed={gateCert?.delivery_status==="READY"}/>
          <GateRow label="Destination package ready" passed={packages.some((p:any)=>["READY","AUTHORIZED","DELIVERED"].includes(p.readiness_state))}/>
        </div>
        <div className="rounded-xl border border-line p-3 text-sm"><strong>Buyer visibility:</strong> {gateCert&&gateCert.ott_preparation_status==="READY"&&gateCert.packaging_status==="COMPLETE"&&gateCert.curation_status==="APPROVED"&&gateCert.delivery_status==="READY"&&packages.some((p:any)=>["READY","AUTHORIZED","DELIVERED"].includes(p.readiness_state))&&hasPassedQc&&Boolean(latestLegal?.status==="APPROVED"&&validGrant)?"All listed persisted gates satisfy the local checklist; server-side publication check remains authoritative.":"Blocked — one or more required QC, legal, publication or package gates are incomplete."}</div>
        <SimpleTable title="Destination package records" description="Packages must be tied to the selected QC and legal evidence" rows={packages} fields={["destination","readiness_state","rights_grant_id","qc_case_id","legal_case_id","authorized_at"]}/>
        <SimpleTable title="Loop publication records" description="Publication authorization remains separate from licensing readiness" rows={publications} fields={["authorization_status","territories","languages","window_start","window_end","approved_at"]}/>
      </section>

      <section className="space-y-3">
        <SectionHeader title="6 · Audit trail" description="Workflow transitions and evidence-backed actions already persisted against this title."/>
        {events.length?<div className="space-y-2">{events.map((event:any,index:number)=><div key={event.id??index} className="rounded-xl border border-line p-3 text-xs"><strong>{event.from_status??"Created"} → {event.to_status}</strong><p className="mt-1 text-muted">{dateLabel(event.created_at)} · {event.actor_user_id??"Unknown reviewer"}</p><p className="mt-1">{event.note??"No note"}</p></div>)}</div>:<Empty text="No lifecycle events found."/>}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <p className="text-xs text-muted">Final approval and delivery remain disabled in this checklist until the authoritative server-side gates confirm readiness.</p>
        <Button variant="outline" onClick={()=>onClose()}>Close checklist</Button>
      </footer>
    </section>
  </div>;
}

function Info({label,value}:{label:string;value:unknown}) {
  return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 break-words text-sm font-medium">{value===null||value===undefined||value===""?"Not recorded":String(value)}</p></div>;
}
function GateRow({label,passed}:{label:string;passed:boolean}) {
  return <div className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm"><span>{label}</span><StatePill state={gateState(passed)}/></div>;
}
function AssetRegister({assets,titleName,versions}:{assets:any[];titleName:Map<any,any>;versions:any[]}) {
  const grouped=new Map<string,any[]>();
  for(const asset of assets){const group=grouped.get(asset.title_id)??[];group.push(asset);grouped.set(asset.title_id,group);}
  return <section className="space-y-3"><SectionHeader title="Asset register" description="Only show file category, verification status, size and type. Raw object storage keys are hidden from the Admin table."/>{assets.length?<div className="space-y-3">{[...grouped.entries()].map(([id,rows])=><div key={id} className="rounded-2xl border border-line p-4"><p className="mb-3 font-medium">{titleName.get(id)??id} · {rows.length} records</p><div className="grid gap-2 sm:grid-cols-2">{rows.map((asset:any)=><div key={asset.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm"><div><p>{asset.kind}</p><p className="text-xs text-muted">{fileSize(asset.byte_size)} · {asset.content_type??"Type not recorded"}</p></div><StatePill state={Number(asset.byte_size)>0?"PASSED":"BLOCKED"}/></div>)}</div></div>)}</div>:<Empty text="No assets recorded."/>}<p className="text-xs text-muted">{versions.length} technical asset-version records. Stored upload verification does not mean playback or content QC.</p></section>;
}
function BuyerRelease({titles,canApprove,onGate,gates}:{titles:any[];canApprove:boolean;onGate:(id:string,gate:string)=>void;gates:any[]}) {
  return <section className="space-y-3"><SectionHeader title="Buyer release" description="Review persisted buyer-visibility gates. Do not pass a gate until its evidence is reviewed in the title checklist."/>
    {titles.map((title:any)=>{const gate=gates.find((item:any)=>item.title_id===title.id);return <div key={title.id} className="rounded-2xl border border-line p-4"><p className="font-medium">{title.name}</p><p className="mt-1 text-xs text-muted">{title.status} · OTT {gate?.ott_preparation_status??"HOLD"} · Package {gate?.packaging_status??"HOLD"} · Curation {gate?.curation_status??"HOLD"} · Delivery {gate?.delivery_status??"HOLD"}</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={()=>onGate(title.id,"OTT")} disabled={!canApprove}>Open OTT gate action</Button></div></div>;})}
  </section>;
}
