import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";
import { authorizeLoopPublication, suspendLoopPublication, revokeLoopPublication } from "@/lib/bridge/loop-publication";
import { listDuplicateReviews, openDuplicateReview, decideDuplicateReview } from "@/lib/bridge/duplicate-reconciliation";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "QC", "Rights", "Assets", "Buyers", "Publication", "Deliveries", "Audit"] as const;
type Tab = (typeof TABS)[number];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", UPLOADING: "Uploading", PREPARING: "Preparing", QC_REVIEW: "QC Review",
  RIGHTS_REVIEW: "Rights Review", LICENSING_READY: "Licensing Ready", LIVE_FOR_BUYERS: "Live for Buyers",
  IN_NEGOTIATION: "In Negotiation", LICENSED: "Licensed", DELIVERED: "Delivered",
};

function AdminWorkstations() {
  return (
    <RequireBridge allow="internal">
      {(actor) => <BridgeShell actor={actor} title="Admin"><WorkstationBody /></BridgeShell>}
    </RequireBridge>
  );
}

function WorkstationBody() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin-workstations"], queryFn: () => listAdminWorkstations() });
  const review = useMutation({
    mutationFn: reviewAdminTitle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const gate = useMutation({
    mutationFn: setBuyerPublicationGate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const [activeTab, setActiveTab] = useState<Tab>("Titles");
  const [publicationTitleId, setPublicationTitleId] = useState("");
  const [territoriesText, setTerritoriesText] = useState("IN");
  const [languagesText, setLanguagesText] = useState("");
  const [models, setModels] = useState<string[]>(["SVOD"]);
  const [accessTier, setAccessTier] = useState<"FREE" | "SVOD" | "TVOD">("SVOD");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const publication = useMutation({
    mutationFn: authorizeLoopPublication,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-workstations"] });
      setPublicationTitleId("");
    },
  });
  const suspendPublication = useMutation({
    mutationFn: suspendLoopPublication,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const revokePublication = useMutation({
    mutationFn: revokeLoopPublication,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });

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
        {TABS.map((tab) => (
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
      ) : activeTab === "Assets" ? (
        <SimpleTable title="Assets" description={data.assets.length + " base assets · " + data.assetVersions.length + " versioned assets"}
          rows={data.assets} fields={["kind", "s3_key", "content_type", "byte_size"]} />
      ) : activeTab === "Buyers" ? (
        <BuyerRelease titles={data.titles} qc={data.qc} legal={data.legal} gate={gate}
          onGate={(titleId, gateName) => gate.mutate({ data: { titleId, gate: gateName as "OTT", decision: "PASS" } })} />
      ) : activeTab === "Publication" ? (
        <PublicationControl
          titles={data.titles}
          publications={data.publications}
          selectedTitleId={publicationTitleId}
          setSelectedTitleId={setPublicationTitleId}
          territoriesText={territoriesText}
          setTerritoriesText={setTerritoriesText}
          languagesText={languagesText}
          setLanguagesText={setLanguagesText}
          models={models}
          setModels={setModels}
          accessTier={accessTier}
          setAccessTier={setAccessTier}
          windowStart={windowStart}
          setWindowStart={setWindowStart}
          windowEnd={windowEnd}
          setWindowEnd={setWindowEnd}
          publish={publication}
          suspend={suspendPublication}
          revoke={revokePublication}
        />
      ) : activeTab === "Deliveries" ? (
        <div className="space-y-6">
          <SimpleTable title="Licensing & Delivery" description={ready.length + " titles in the commercial pipeline"}
            rows={ready} fields={["name", "status", "language", "licensing_fee_paise", "updated_at"]} />
          <SimpleTable title="Destination Packages" description={data.packages.length + " persisted packages"}
            rows={data.packages} fields={["destination", "package_version", "readiness_state", "commercial_model", "authorized_at"]} />
          <SimpleTable title="Bridge Publications" description={data.publications.length + " persisted authorization records"}
            rows={data.publications} titleName={titleName} fields={["bridge_title_id", "authorization_status", "territories", "languages", "window_end"]} />
        </div>
      ) : (
        <SimpleTable title="Audit History" description="Persisted operator activity. No UI-only decisions."
          rows={data.audit} fields={["action", "entity_type", "entity_id", "actor_user_id", "created_at"]} />
      )}

      {review.isError || gate.isError || publication.isError || suspendPublication.isError || revokePublication.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-sm">Action failed: {String(review.error ?? gate.error ?? publication.error ?? suspendPublication.error ?? revokePublication.error)}</p> : null}
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
              {title.status === "PREPARING" ? <ActionButton label="Accept → QC" onClick={() => review.mutate({ data: { titleId: title.id, decision: "ACCEPT" } })} disabled={review.isPending} /> : null}
              <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">Open</Link>
            </div>
          </div>
        )) : <Empty text="No titles in the Bridge catalog." />}
      </div>
    </section>
  );
}


function PublicationControl({
  titles, publications, selectedTitleId, setSelectedTitleId,
  territoriesText, setTerritoriesText, languagesText, setLanguagesText,
  models, setModels, accessTier, setAccessTier, windowStart, setWindowStart,
  windowEnd, setWindowEnd, publish, suspend, revoke,
}: {
  titles: any[]; publications: any[]; selectedTitleId: string; setSelectedTitleId: (v: string) => void;
  territoriesText: string; setTerritoriesText: (v: string) => void; languagesText: string; setLanguagesText: (v: string) => void;
  models: string[]; setModels: (v: string[]) => void; accessTier: "FREE" | "SVOD" | "TVOD"; setAccessTier: (v: "FREE" | "SVOD" | "TVOD") => void;
  windowStart: string; setWindowStart: (v: string) => void; windowEnd: string; setWindowEnd: (v: string) => void;
  publish: any; suspend: any; revoke: any;
}) {
  const selectedTitle = titles.find((title) => title.id === selectedTitleId);
  const existing = publications.find((row) => row.bridge_title_id === selectedTitleId);
  const toggleModel = (model: string, checked: boolean) => setModels(checked ? [...models, model] : models.filter((item) => item !== model));
  const canSubmit = Boolean(selectedTitleId && territoriesText.trim() && languagesText.trim() && models.includes(accessTier) && !publish.isPending);
  return <section className="space-y-5">
    <SectionHeader title="Loop Publication Control" description="Server-side rights preflight runs before authorization. Drafts never become public just because assets were uploaded." />
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6 space-y-4">
      <label className="block space-y-1 text-sm"><span className="font-medium">Bridge title</span>
        <select className="w-full rounded-xl border border-line bg-bg p-3" value={selectedTitleId} onChange={(event) => { setSelectedTitleId(event.target.value); setLanguagesText(titles.find((title) => title.id === event.target.value)?.language || ""); }} >
          <option value="">Select a title — no action is preselected</option>
          {titles.map((title) => <option key={title.id} value={title.id}>{title.name} · {title.status}</option>)}
        </select>
      </label>
      {selectedTitle ? <p className="text-sm text-muted">Selected: {selectedTitle.name}. Status: {selectedTitle.status}. Authorization can still fail if QC, rights, master, artwork, or commercial terms are incomplete.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span className="font-medium">Territories (comma-separated ISO codes)</span><input className="w-full rounded-xl border border-line bg-bg p-3" value={territoriesText} onChange={(event) => setTerritoriesText(event.target.value)} placeholder="IN, AE" /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Languages (comma-separated)</span><input className="w-full rounded-xl border border-line bg-bg p-3" value={languagesText} onChange={(event) => setLanguagesText(event.target.value)} placeholder="ml, en" /></label>
      </div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Allowed exploitation models</legend>
        <div className="flex flex-wrap gap-4 text-sm">{["SVOD", "TVOD", "AVOD", "FREE", "PROMOTIONAL"].map((model) => <label key={model} className="flex items-center gap-2"><input type="checkbox" checked={models.includes(model)} onChange={(event) => toggleModel(model, event.target.checked)} />{model}</label>)}</div>
        <p className="text-xs text-muted">PPV is not available in this authorization API yet. Do not select a model that is not covered by the signed rights grant.</p>
      </fieldset>
      <label className="block space-y-1 text-sm"><span className="font-medium">Loop viewer access tier</span><select className="w-full rounded-xl border border-line bg-bg p-3" value={accessTier} onChange={(event) => setAccessTier(event.target.value as "FREE" | "SVOD" | "TVOD")}><option value="FREE">FREE</option><option value="SVOD">SVOD</option><option value="TVOD">TVOD</option></select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span className="font-medium">Window starts (optional)</span><input type="datetime-local" className="w-full rounded-xl border border-line bg-bg p-3" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Window ends (optional)</span><input type="datetime-local" className="w-full rounded-xl border border-line bg-bg p-3" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canSubmit} onClick={() => publish.mutate({ data: {
          bridgeTitleId: selectedTitleId, destination: "CRAYONS_LOOP",
          territories: territoriesText.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean),
          languages: languagesText.split(",").map((v) => v.trim()).filter(Boolean),
          exploitationModels: models as ("SVOD" | "TVOD" | "AVOD" | "FREE" | "PROMOTIONAL")[],
          accessTier,
          windowStart: windowStart ? new Date(windowStart).toISOString() : null,
          windowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
        } })}>{publish.isPending ? "Checking rights…" : "Authorize & publish to Loop"}</Button>
        <Button variant="outline" disabled={!existing || suspend.isPending} onClick={() => suspend.mutate({ data: { bridgeTitleId: selectedTitleId, reason: "Admin publication control suspension" } })}>Suspend</Button>
        <Button variant="outline" disabled={!existing || revoke.isPending} onClick={() => revoke.mutate({ data: { bridgeTitleId: selectedTitleId } })}>Revoke authorization</Button>
      </div>
      {existing ? <p className="text-xs text-muted">Current record: {existing.authorization_status} · listed/published values shown below. Revoke and suspend actions are server-authorized and audited.</p> : null}
      {publish.isSuccess ? <p role="status" className="text-sm">Authorization succeeded. Loop title ID: {publish.data.loopTitleId}</p> : null}
    </div>
    <SimpleTable title="Persisted publication records" description="Current Bridge authorization state; this table is read-only." rows={publications} fields={["bridge_title_id", "authorization_status", "territories", "languages", "exploitation_models", "window_start", "window_end", "approved_by", "approved_at", "revoked_at"]} />
  </section>;
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
function BuyerRelease({ titles, onGate }: { titles: any[]; qc?: any; legal?: any; gate?: any; onGate: (titleId: string, gateName: string) => void }) {
  return <section className="space-y-3"><SectionHeader title="Buyer release" description="Pass a gate only after the required check." />{titles.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line p-4"><span>{t.name}</span><ActionButton label="Pass gate" onClick={() => onGate(t.id, "buyer")} /></div>)}</section>;
}