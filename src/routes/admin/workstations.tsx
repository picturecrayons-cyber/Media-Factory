import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate, updateBusinessReview, updateCommercialTerms } from "@/lib/bridge/admin-workstations";
import { listDuplicateReviews, openDuplicateReview, decideDuplicateReview } from "@/lib/bridge/duplicate-reconciliation";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "Business", "Revenue", "Distribution", "Assets", "Deliveries", "Audit"] as const;
type Tab = (typeof TABS)[number];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", UPLOADING: "Uploading", PREPARING: "Preparing", QC_REVIEW: "QC Review",
  RIGHTS_REVIEW: "Rights Review", LICENSING_READY: "Licensing Ready", LIVE_FOR_BUYERS: "Live for Buyers",
  IN_NEGOTIATION: "In Negotiation", LICENSED: "Licensed", DELIVERED: "Delivered",
};

function AdminWorkstations() {
  return (
    <RequireBridge allow="internal">
      {(actor) => actor.internalRole === "admin" || actor.internalRole === "super_admin"
        ? <BridgeShell actor={actor} title="Admin"><WorkstationBody actor={actor} /></BridgeShell>
        : <BridgeShell actor={actor} title="Admin"><div className="rounded-xl border border-line p-5 text-sm">Admin access required.</div></BridgeShell>}
    </RequireBridge>
  );
}

function WorkstationBody({ actor }: { actor: any }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin-workstations"], queryFn: () => listAdminWorkstations() });
  const review = useMutation({
    mutationFn: reviewAdminTitle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const business = useMutation({ mutationFn: updateBusinessReview, onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }) });
  const revenue = useMutation({ mutationFn: updateCommercialTerms, onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }) });
  const gate = useMutation({
    mutationFn: setBuyerPublicationGate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const [activeTab, setActiveTab] = useState<Tab>("Titles");
  const visibleTabs = actor.internalRole === "super_admin"
    ? TABS.filter((tab) => !["Business", "Revenue", "Distribution"].includes(tab))
    : TABS;

  const data = query.data;
  if (query.isLoading) return <div className="p-8 text-sm text-muted">Loading Admin…</div>;
  if (query.isError || !data) return <div className="rounded-2xl border border-line bg-surface p-8 text-sm">Unable to load the Bridge operational backend.</div>;

  const titleName = new Map(data.titles.map((t: any) => [t.id, t.name]));
  const qcQueue = data.titles.filter((t: any) => t.status === "QC_REVIEW");
  const rightsQueue = data.titles.filter((t: any) => t.status === "RIGHTS_REVIEW");
  const ready = data.titles.filter((t: any) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bridge Admin</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold">Control titles. Clear gates. Release safely.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">Internal controls only. Buyer visibility stays fail-closed until the canonical title clears its required gates.</p>
          </div>
          <Link to="/admin" className="text-sm text-accent hover:underline">← Admin overview</Link>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto border-b border-line pb-2">
        {visibleTabs.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={"whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition " + (activeTab === tab ? "bg-fg text-bg" : "border border-line bg-surface text-muted hover:text-fg")}>
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Titles" ? (
        <TitleQueue titles={data.titles} review={review} />
      ) : activeTab === "QC" ? (
        <ReviewQueue title="QC Review" description="Review technical quality before rights review." titles={qcQueue}
          actions={[["PASS", "Approve → Rights"], ["FAIL", "Fail QC"]]} mutation={review} />
      ) : activeTab === "Rights" ? (
        <ReviewQueue title="Rights Review" description="Clear ownership, territory, language and window before licensing." titles={rightsQueue}
          actions={[["APPROVE", "Approve → Licensing"], ["REJECT", "Reject"]]} mutation={review} />
      ) : activeTab === "Business" ? (
        <BusinessReview rows={data.rights} mandates={data.creatorMandates} titles={titleName} mutation={business} />
      ) : activeTab === "Revenue" ? (
        <RevenueReview rows={data.rights} titles={titleName} mutation={revenue} />
      ) : activeTab === "Distribution" ? (
        <DistributionReview titles={data.titles} gates={data.gates} mutation={gate} />
      ) : activeTab === "Assets" ? (
        <SimpleTable title="Assets" description={data.assets.length + " base assets · " + data.assetVersions.length + " versioned assets"}
          rows={data.assets} fields={["kind", "content_type", "byte_size", "checksum_sha256", "storage_verified_at"]} />
      ) : activeTab === "Deliveries" ? (
        <div className="space-y-6">
          <SimpleTable title="Licensing & Delivery" description={ready.length + " titles in the commercial pipeline"}
            rows={ready} fields={["name", "status", "language", "licensing_fee_paise", "updated_at"]} />
          <SimpleTable title="Destination Packages" description={data.packages.length + " persisted packages"}
            rows={data.packages} fields={["destination", "package_version", "readiness_state", "monetization", "consumer_metadata", "authorized_at"]} />
          <SimpleTable title="Bridge Publications" description={data.publications.length + " persisted authorization records"}
            rows={data.publications} titleName={titleName} fields={["bridge_title_id", "authorization_status", "territories", "languages", "window_end"]} />
        </div>
      ) : (
        <SimpleTable title="Audit History" description="Persisted operator activity. No UI-only decisions."
          rows={data.audit} fields={["action", "entity_type", "entity_id", "actor_user_id", "created_at"]} />
      )}

      {review.isError || gate.isError ? <p className="rounded-xl border border-line p-4 text-sm">Action failed: {String(review.error ?? gate.error)}</p> : null}
    </div>
  );
}

function TitleQueue({ titles, review }: { titles: any[]; review: any }) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Titles" description="One canonical Title ID from intake through delivery." />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {titles.length ? titles.slice(0, 100).map((title) => (
          <div key={title.id} className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{title.name}</p>
              <p className="mt-1 text-xs text-muted">{STATUS_LABELS[title.status] ?? title.status} · {title.language}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              
              <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">Open</Link>
            </div>
          </div>
        )) : <Empty text="No titles in the Bridge catalog." />}
      </div>
    </section>
  );
}

function DuplicateReviewSection() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["duplicate-reviews"], queryFn: () => listDuplicateReviews() });
  const openMutation = useMutation({ mutationFn: openDuplicateReview, onSuccess: () => qc.invalidateQueries({ queryKey: ["duplicate-reviews"] }) });
  const decideMutation = useMutation({ mutationFn: decideDuplicateReview, onSuccess: () => qc.invalidateQueries({ queryKey: ["duplicate-reviews"] }) });
  const reviews = [...(query.data?.reviews ?? []), ...(query.data?.knownCandidates ?? [])];
  return <section id="duplicate-reviews" className="space-y-4">
    <div><h3 className="font-display text-2xl font-semibold">11 · Duplicate Title Review</h3><p className="text-sm text-muted">Review identity and dependency conflicts before any reconciliation. Approval only creates a reconciliation-ready record; title references are never changed here.</p></div>
    {query.isLoading ? <Empty text="Loading duplicate reviews…"/> : query.isError ? <Empty text="Unable to load duplicate reviews."/> : !reviews.length ? <Empty text="No duplicate candidates require review."/> : <div className="space-y-3">{reviews.map((r:any)=><div key={r.id} className="rounded-2xl border border-line bg-elevated p-4 space-y-3">
      <div><p className="font-medium">{r.candidateName} → {r.canonicalName}</p><p className="text-xs text-muted">{r.status} · identity {r.identityConfidence} · Loop {r.loopIdentityStatus ?? "BLOCKED"}</p></div>
      <div className="grid gap-2 text-xs sm:grid-cols-3"><span>Rights: {r.rightsConflictStatus ?? "UNRESOLVED"}</span><span>Territory: {r.territoryConflictStatus ?? "UNRESOLVED"}</span><span>Window: {r.windowConflictStatus ?? "UNRESOLVED"}</span><span>Assets: {r.assetReferenceStatus ?? "UNRESOLVED"}</span><span>Delivery: {r.deliveryReferenceStatus ?? "UNRESOLVED"}</span><span>Buyer mappings: {r.buyerMappingStatus ?? "UNRESOLVED"}</span></div>
      {!r.persisted ? <Button size="sm" disabled={openMutation.isPending} onClick={() => openMutation.mutate({ data: { candidateTitleId: r.candidateTitleId, canonicalTitleId: r.canonicalTitleId } })}>Open review</Button> : <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ data: { reviewId: r.id, decision: "HOLD", identityConfidence: r.identityConfidence, rightsConflictStatus: r.rightsConflictStatus ?? "UNKNOWN", territoryConflictStatus: r.territoryConflictStatus ?? "UNKNOWN", windowConflictStatus: r.windowConflictStatus ?? "UNKNOWN", assetReferenceStatus: r.assetReferenceStatus ?? "UNKNOWN", deliveryReferenceStatus: r.deliveryReferenceStatus ?? "UNKNOWN", buyerMappingStatus: r.buyerMappingStatus ?? "UNKNOWN" } })}>Hold</Button><Button size="sm" variant="outline" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ data: { reviewId: r.id, decision: "NO_MERGE", identityConfidence: r.identityConfidence, rightsConflictStatus: r.rightsConflictStatus ?? "UNKNOWN", territoryConflictStatus: r.territoryConflictStatus ?? "UNKNOWN", windowConflictStatus: r.windowConflictStatus ?? "UNKNOWN", assetReferenceStatus: r.assetReferenceStatus ?? "UNKNOWN", deliveryReferenceStatus: r.deliveryReferenceStatus ?? "UNKNOWN", buyerMappingStatus: r.buyerMappingStatus ?? "UNKNOWN" } })}>No merge</Button><Button size="sm" disabled={decideMutation.isPending || r.identityConfidence !== "CONFIRMED"} onClick={() => decideMutation.mutate({ data: { reviewId: r.id, decision: "APPROVE", identityConfidence: "CONFIRMED", rightsConflictStatus: r.rightsConflictStatus ?? "CLEAR", territoryConflictStatus: r.territoryConflictStatus ?? "CLEAR", windowConflictStatus: r.windowConflictStatus ?? "CLEAR", assetReferenceStatus: r.assetReferenceStatus ?? "CLEAR", deliveryReferenceStatus: r.deliveryReferenceStatus ?? "CLEAR", buyerMappingStatus: r.buyerMappingStatus ?? "CLEAR" } })}>Approve reconciliation</Button></div>}
    </div>)}</div>}
  </section>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">{text}</div>; }

function RecordTable({ rows, fields, titleName }: { rows: any[]; fields: string[]; titleName: Map<any, any> }) {
  if (!rows.length) return <Empty text="No persisted records."/>;
  return <div className="overflow-x-auto rounded-2xl border border-line"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr>{fields.map(f=><th key={f} className="px-3 py-3">{f.replaceAll("_"," ")}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.slice(0,50).map((row,i)=><tr key={String(row.id ?? row.user_id ?? i)}>{fields.map(f=><td key={f} className="max-w-[320px] truncate px-3 py-3">{f==="title_id" ? (titleName.get(row[f]) ?? row[f]) : typeof row[f] === "object" ? JSON.stringify(row[f]) : String(row[f] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <div><h3 className="font-display text-2xl font-semibold">{title}</h3><p className="text-sm text-muted">{description}</p></div>;
}
function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <Button size="sm" disabled={disabled} onClick={onClick}>{label}</Button>;
}
function ReviewQueue({ title, description, titles, actions, mutation }: { title: string; description: string; titles: any[]; actions: [string, string][]; mutation: any }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} />{titles.length ? titles.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line p-4"><span>{t.name}</span><div className="flex gap-2">{actions.map(([decision, label]) => <ActionButton key={decision} label={label} disabled={mutation.isPending} onClick={() => mutation.mutate({ data: { titleId: t.id, decision } })} />)}</div></div>) : <Empty text="Queue is clear." />}</section>;
}
function SimpleTable({ title, description, rows, fields, titleName }: { title: string; description: string; rows: any[]; fields: string[]; titleName?: Map<any, any> }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} /><RecordTable rows={rows} fields={fields} titleName={titleName ?? new Map()} /></section>;
}

function BusinessReview({ rows, mandates, titles, mutation }: { rows: any[]; mandates: any[]; titles: Map<any,any>; mutation: any }) {
  const drafts = rows.filter((r) => r.status === "DRAFT");
  const [notes, setNotes] = useState<Record<string,string>>({});
  return <section className="space-y-4">
    <SectionHeader title="Business review" description="Review creator distribution mandates and record the Admin business review on draft rights grants. Creator consent itself is not overwritten." />
    <SimpleTable title="Creator distribution mandates" description={mandates.length + " persisted creator/studio mandates"} rows={mandates} fields={["display_name","account_type","mandate_version","status","scope","accepted_at","consent_text_version"]} />
    <div className="space-y-3">{drafts.map((g:any)=><article key={g.id} className="rounded-2xl border border-line bg-surface p-4 space-y-3">
      <div><p className="font-semibold">{titles.get(g.title_id) ?? g.title_id}</p><p className="text-xs text-muted">Draft rights grant · {g.grant_type} · {g.exclusivity}</p></div>
      <pre className="whitespace-pre-wrap break-words rounded-xl bg-elevated p-3 text-xs text-muted">{JSON.stringify(Array.isArray(g.evidence) ? g.evidence[0]?.businessReview ?? {} : {},null,2)}</pre>
      <textarea value={notes[g.id] ?? ""} onChange={(e)=>setNotes(old=>({...old,[g.id]:e.target.value}))} placeholder="Business review notes" className="min-h-20 w-full rounded-xl border border-line bg-bg p-3 text-sm" />
      <div className="flex gap-2"><Button size="sm" disabled={(notes[g.id] ?? "").trim().length<3 || mutation.isPending} onClick={()=>mutation.mutate({data:{titleId:g.title_id,grantId:g.id,status:"REVIEWED",notes:notes[g.id]}})}>Mark reviewed</Button><Button size="sm" variant="outline" disabled={(notes[g.id] ?? "").trim().length<3 || mutation.isPending} onClick={()=>mutation.mutate({data:{titleId:g.title_id,grantId:g.id,status:"HOLD",notes:notes[g.id]}})}>Hold</Button></div>
    </article>)}</div>
    {!drafts.length ? <Empty text="No draft rights grants are waiting for Business review."/> : null}
  </section>;
}

function RevenueReview({ rows, titles, mutation }: { rows: any[]; titles: Map<any,any>; mutation: any }) {
  const drafts = rows.filter((r) => r.status === "DRAFT");
  const [values, setValues] = useState<Record<string,{owner:string;distributor:string;fee:string;notes:string}>>({});
  return <section className="space-y-4">
    <SectionHeader title="Revenue review" description="Set the commercial revenue split on DRAFT rights grants. Shares must total 100%; Legal approval locks this review stage." />
    {drafts.map((g:any)=>{
      const terms = Array.isArray(g.evidence) ? g.evidence[0]?.commercialTerms ?? {} : {};
      const v = values[g.id] ?? {owner:String(terms.rightsOwnerSharePct ?? 0),distributor:String(terms.distributorSharePct ?? 0),fee:String(terms.feePaise ?? ""),notes:String(terms.notes ?? "")};
      return <article key={g.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div><p className="font-semibold">{titles.get(g.title_id) ?? g.title_id}</p><p className="text-xs text-muted">Draft rights grant · {g.grant_type}</p></div>
        <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-muted">Rights owner share %<input type="number" min="0" max="100" value={v.owner} onChange={(e)=>setValues(old=>({...old,[g.id]:{...v,owner:e.target.value}}))} className="mt-1 h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"/></label><label className="text-xs text-muted">Distributor share %<input type="number" min="0" max="100" value={v.distributor} onChange={(e)=>setValues(old=>({...old,[g.id]:{...v,distributor:e.target.value}}))} className="mt-1 h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"/></label><label className="text-xs text-muted">License fee (paise)<input type="number" min="0" value={v.fee} onChange={(e)=>setValues(old=>({...old,[g.id]:{...v,fee:e.target.value}}))} className="mt-1 h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"/></label><label className="text-xs text-muted">Commercial notes<input value={v.notes} onChange={(e)=>setValues(old=>({...old,[g.id]:{...v,notes:e.target.value}}))} className="mt-1 h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"/></label></div>
        <p className="text-xs text-muted">Current split total: {Number(v.owner||0)+Number(v.distributor||0)}%</p>
        <Button size="sm" disabled={Number(v.owner)+Number(v.distributor)!==100 || mutation.isPending} onClick={()=>mutation.mutate({data:{titleId:g.title_id,grantId:g.id,rightsOwnerSharePct:Number(v.owner),distributorSharePct:Number(v.distributor),feePaise:v.fee===""?undefined:Number(v.fee),notes:v.notes||undefined}})}>Save revenue terms</Button>
      </article>;
    })}
    {!drafts.length ? <Empty text="No draft rights grants are waiting for Revenue review."/> : null}
  </section>;
}

function DistributionReview({ titles, gates, mutation }: { titles: any[]; gates: any[]; mutation: any }) {
  const gateByTitle = new Map(gates.map((g:any)=>[g.title_id,g]));
  const gateNames = ["OTT","PACKAGING","CURATION","DELIVERY"] as const;
  return <section className="space-y-3">
    <SectionHeader title="Distribution review" description="Admin can pass or hold readiness gates. This is not a publish control; Buyer Loop publication remains Super Admin only." />
    {titles.map((t:any)=>{
      const g:any=gateByTitle.get(t.id) ?? {};
      return <article key={t.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div><p className="font-semibold">{t.name}</p><p className="text-xs text-muted">{t.status}</p></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {gateNames.map((name)=>{
            const field = name==="OTT" ? "ott_preparation_status" : name==="PACKAGING" ? "packaging_status" : name==="CURATION" ? "curation_status" : "delivery_status";
            return <div key={name} className="rounded-xl border border-line p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{name}</p><span className="text-xs text-muted">{g[field] ?? "HOLD"}</span></div><div className="mt-2 flex flex-wrap gap-1"><button type="button" className="rounded-full border border-line px-2 py-1 text-xs" onClick={()=>mutation.mutate({data:{titleId:t.id,gate:name,decision:"PASS"}})}>Pass</button><button type="button" className="rounded-full border border-line px-2 py-1 text-xs" onClick={()=>mutation.mutate({data:{titleId:t.id,gate:name,decision:"HOLD"}})}>Hold</button><button type="button" className="rounded-full border border-line px-2 py-1 text-xs" onClick={()=>mutation.mutate({data:{titleId:t.id,gate:name,decision:"FAIL"}})}>Fail</button></div></div>;
          })}
        </div>
      </article>;
    })}
  </section>;
}
