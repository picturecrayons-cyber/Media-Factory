import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StoryConceptDesk } from "@/components/bridge/story-concept-desk";
import { hasPermission } from "@/lib/bridge/rbac";
import type { BridgeActor } from "@/lib/bridge/session";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate, setTitleReleaseControl, publishTitleToBuyers } from "@/lib/bridge/admin-workstations";
import { reviewTitleWorkflow } from "@/lib/bridge/workflow";
import { listDuplicateReviews, openDuplicateReview, decideDuplicateReview } from "@/lib/bridge/duplicate-reconciliation";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "Concepts", "QC", "Rights", "Assets", "Buyers", "Deliveries", "Audit"] as const;
type Tab = (typeof TABS)[number];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", UPLOADING: "Uploading", PREPARING: "Preparing", QC_REVIEW: "QC Review",
  RIGHTS_REVIEW: "Rights Review", LICENSING_READY: "Licensing Ready", LIVE_FOR_BUYERS: "Live for Buyers",
  IN_NEGOTIATION: "In Negotiation", LICENSED: "Licensed", DELIVERED: "Delivered",
};

function AdminWorkstations() {
  return (
    <RequireBridge allow="internal">
      {(actor) => <BridgeShell actor={actor} title="Admin"><WorkstationBody actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function WorkstationBody({ actor }: { actor: BridgeActor }) {
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
  const rightsReview = useMutation({
    mutationFn: reviewTitleWorkflow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const releaseControl = useMutation({
    mutationFn: setTitleReleaseControl,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const publish = useMutation({
    mutationFn: publishTitleToBuyers,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const [activeTab, setActiveTab] = useState<Tab>("Titles");

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
      ) : activeTab === "Concepts" ? (
        <StoryConceptDesk />
      ) : activeTab === "QC" ? (
        <ReviewQueue title="QC Review" description="Review technical quality before rights review." titles={qcQueue}
          canAct={hasPermission(actor, "title.qc_review")} actions={[["PASS", "Approve → Rights"], ["FAIL", "Fail QC"]]} mutation={review} />
      ) : activeTab === "Rights" ? (
        <RightsGrantQueue titles={rightsQueue} grants={data.rights} actor={actor} mutation={rightsReview} />
      ) : activeTab === "Assets" ? (
        <SimpleTable title="Assets" description={data.assets.length + " base assets · " + data.assetVersions.length + " versioned assets"}
          rows={data.assets} fields={["kind", "s3_key", "content_type", "byte_size"]} />
      ) : activeTab === "Buyers" ? (
        <BuyerRelease
          titles={data.titles}
          gateCertifications={data.gateCertifications}
          packages={data.packages}
          rights={data.rights}
          legal={data.legal}
          canApprove={hasPermission(actor, "title.approve")}
          onGate={(titleId, gateName, decision, notes) => gate.mutate({ data: { titleId, gate: gateName, decision, notes } })}
          onRelease={(titleId, decision, reason) => releaseControl.mutate({ data: { titleId, decision, reason } })}
          onPublish={(titleId) => publish.mutate({ data: { titleId } })}
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

      {review.isError || gate.isError || rightsReview.isError || releaseControl.isError || publish.isError ? <p className="rounded-xl border border-line p-4 text-sm">Action failed: {String(review.error ?? gate.error ?? rightsReview.error ?? releaseControl.error ?? publish.error)}</p> : null}
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
function ReviewQueue({ title, description, titles, canAct, actions, mutation }: { title: string; description: string; titles: any[]; canAct: boolean; actions: [string, string][]; mutation: any }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} />{titles.length ? titles.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line p-4"><span>{t.name}</span>{canAct ? <div className="flex gap-2">{actions.map(([decision, label]) => <ActionButton key={decision} label={label} disabled={mutation.isPending} onClick={() => mutation.mutate({ data: { titleId: t.id, decision } })} />)}</div> : <span className="text-xs text-muted">Review reserved to designated {title.startsWith("QC") ? "QC Reviewer" : "Legal Reviewer"} or Super Admin</span>}</div>) : <Empty text="Queue is clear." />}</section>;
}
function SimpleTable({ title, description, rows, fields, titleName }: { title: string; description: string; rows: any[]; fields: string[]; titleName?: Map<any, any> }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} /><RecordTable rows={rows} fields={fields} titleName={titleName ?? new Map()} /></section>;
}
const RIGHTS_CATEGORIES = [
  { key: "THEATRICAL", label: "Theatrical" },
  { key: "NON_THEATRICAL", label: "Non-Theatrical" },
  { key: "LINEAR", label: "Linear / TV & Broadcast" },
  { key: "NON_LINEAR", label: "Non-Linear / OTT & VOD" },
  { key: "ANCILLARY", label: "Ancillary" },
] as const;

function RightsGrantQueue({ titles, grants, actor, mutation }: { titles: any[]; grants: any[]; actor: BridgeActor; mutation: any }) {
  const canReview = hasPermission(actor, "title.rights_review");
  return <section className="space-y-4">
    <SectionHeader title="Rights review & exploitation coverage" description="Review every grant separately. Mark rights held or not held, verify each category against documentary evidence, then submit the legal review." />
    {!titles.length ? <Empty text="No titles are currently in Rights Review." /> : titles.map((title) => {
      const titleGrants = grants.filter((grant) => grant.title_id === title.id);
      return <div key={title.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-semibold">{title.name}</p><p className="text-xs text-muted">{title.id} · {title.status}</p></div>
          <Link to="/title/$id" params={{ id: title.id }} className="text-xs text-accent hover:underline">Open title</Link>
        </div>
        {!titleGrants.length ? <Empty text="No rights grant records. A grant draft and documentary references must be recorded before review." /> : titleGrants.map((grant) =>
          <RightsGrantCard key={grant.id} title={title} grant={grant} canReview={canReview} mutation={mutation} />
        )}
      </div>;
    })}
  </section>;
}

function RightsGrantCard({ title, grant, canReview, mutation }: { title: any; grant: any; canReview: boolean; mutation: any }) {
  const [note, setNote] = useState("");
  const [scope, setScope] = useState(() => RIGHTS_CATEGORIES.map((category) => ({
    category: category.key,
    available: false,
    verified: false,
    evidenceReference: "",
    notes: "",
  })));
  const allVerified = scope.length === RIGHTS_CATEGORIES.length && scope.every((item) => item.verified && item.evidenceReference.trim().length >= 8);
  const editable = canReview && grant.status === "DRAFT" && title.status === "RIGHTS_REVIEW";
  return <article className="space-y-3 rounded-xl border border-line p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="font-medium">Rights grant · {grant.grant_type}</p><p className="text-xs text-muted">Status: {grant.status} · {grant.exclusivity} · {grant.id}</p></div>
      <span className="text-xs text-muted">{(grant.territories ?? []).join(", ")} · {(grant.languages ?? []).join(", ")}</span>
    </div>
    <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
      <p>Window: {grant.window_start ?? "Not set"} → {grant.window_end ?? "Not set"}</p>
      <p>Media: {(grant.media ?? []).join(", ") || "Not recorded"}</p>
    </div>
    {grant.status === "VALID" ? <p className="text-xs text-emerald-700">Approved grant · database status VALID</p> : null}
    {grant.status === "DRAFT" ? <>
      <div className="rounded-lg border border-line p-3">
        <p className="mb-3 text-sm font-semibold">Rights availability checklist</p>
        <p className="mb-3 text-xs text-muted">“Rights available” unchecked means the rights are not held / excluded. “Evidence verified” must be checked only after reviewing the supporting document. Enter a reference for every category, including rights not held.</p>
        <div className="space-y-3">
          {scope.map((item, index) => <div key={item.category} className="grid gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm font-medium">{RIGHTS_CATEGORIES[index].label}</p>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2"><input type="checkbox" checked={item.available} disabled={!editable} onChange={(event) => setScope((current) => current.map((entry, i) => i === index ? { ...entry, available: event.target.checked } : entry))} /> Rights available / held</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={item.verified} disabled={!editable} onChange={(event) => setScope((current) => current.map((entry, i) => i === index ? { ...entry, verified: event.target.checked } : entry))} /> Evidence verified</label>
            </div>
            <input value={item.evidenceReference} disabled={!editable} onChange={(event) => setScope((current) => current.map((entry, i) => i === index ? { ...entry, evidenceReference: event.target.value } : entry))} placeholder="Agreement / assignment / exclusion evidence reference (min 8 characters)" className="w-full rounded-lg border border-line bg-elevated p-2 text-xs" />
            <input value={item.notes} disabled={!editable} onChange={(event) => setScope((current) => current.map((entry, i) => i === index ? { ...entry, notes: event.target.value } : entry))} placeholder="Optional scope notes / restrictions" className="w-full rounded-lg border border-line bg-elevated p-2 text-xs" />
          </div>)}
        </div>
      </div>
      <label className="grid gap-1 text-xs">Legal reviewer decision note
        <textarea value={note} disabled={!editable} onChange={(event) => setNote(event.target.value)} rows={2} className="rounded-lg border border-line bg-elevated p-2" placeholder="Record what was checked and any restrictions (minimum 8 characters)" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!editable || mutation.isPending || !allVerified || note.trim().length < 8} onClick={() => mutation.mutate({ data: { titleId: title.id, stage: "LEGAL", decision: "APPROVE", note, grantId: grant.id, rightsScope: scope } })}>Verify & approve grant</Button>
        <Button size="sm" variant="outline" disabled={!editable || mutation.isPending || note.trim().length < 8} onClick={() => mutation.mutate({ data: { titleId: title.id, stage: "LEGAL", decision: "REJECT", note, grantId: grant.id } })}>Reject grant</Button>
      </div>
      {!canReview ? <p className="text-xs text-muted">Rights review permission required. Super Admin has this permission.</p> : null}
      {!allVerified ? <p className="text-xs text-amber-700">Approval locked: all five categories need an evidence reference and Evidence verified check.</p> : null}
    </> : null}
  </article>;
}

function BuyerRelease({ titles, gateCertifications, packages, rights, legal, canApprove, onGate, onRelease, onPublish }: {
  titles: any[];
  gateCertifications: any[];
  packages: any[];
  rights: any[];
  legal: any[];
  canApprove: boolean;
  onGate: (titleId: string, gateName: "OTT" | "PACKAGING" | "CURATION" | "DELIVERY", decision: "PASS" | "HOLD", notes: string) => void;
  onRelease: (titleId: string, decision: "HOLD" | "BLOCK" | "RELEASE", reason: string) => void;
  onPublish: (titleId: string) => void;
}) {
  const [gateNotes, setGateNotes] = useState<Record<string, string>>({});
  const [controlReasons, setControlReasons] = useState<Record<string, string>>({});
  const gates = [
    { key: "OTT" as const, label: "OTT preparation", field: "ott_preparation_status" },
    { key: "PACKAGING" as const, label: "Packaging", field: "packaging_status" },
    { key: "CURATION" as const, label: "Curation", field: "curation_status" },
    { key: "DELIVERY" as const, label: "Delivery", field: "delivery_status" },
  ];
  return <section className="space-y-4">
    <SectionHeader title="Buyer release & title controls" description="Pass each publication gate independently. HOLD / BLOCK prevents buyer release until a reasoned Super Admin release action clears the control." />
    {titles.map((title) => {
      const cert = gateCertifications.find((row) => row.title_id === title.id);
      const control = cert?.evidence?.releaseControl;
      const reason = controlReasons[title.id] ?? "";
      const gateReady = Boolean(cert && cert.ott_preparation_status === "READY" && cert.packaging_status === "COMPLETE" && cert.curation_status === "APPROVED" && cert.delivery_status === "READY");
      const packageReady = packages.some((row) => row.title_id === title.id && ["READY", "AUTHORIZED", "DELIVERED"].includes(row.readiness_state) && rights.some((grant) => grant.id === row.rights_grant_id && grant.status === "VALID"));
      const legalReady = legal.some((row) => row.title_id === title.id && row.status === "APPROVED" && (row.evidence ?? []).some((entry: any) => rights.some((grant) => grant.title_id === title.id && grant.status === "VALID" && entry.grantId === grant.id)));
      const publishReady = title.status === "LICENSING_READY" && gateReady && packageReady && legalReady && !["HOLD", "BLOCK"].includes(control?.status ?? "");
      return <div key={title.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{title.name}</p><p className="text-xs text-muted">{title.status} · {title.id}</p></div><span className="text-xs font-semibold">Release control: {control?.status ?? "CLEAR"}</span></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {gates.map((gateDef) => {
            const status = cert?.[gateDef.field] ?? "NOT_SET";
            const key = title.id + ":" + gateDef.key;
            const note = gateNotes[key] ?? "";
            return <div key={gateDef.key} className="rounded-lg border border-line p-3">
              <p className="text-sm font-medium">{gateDef.label}</p><p className="my-1 text-xs text-muted">Status: {status}</p>
              <input value={note} onChange={(event) => setGateNotes((current) => ({ ...current, [key]: event.target.value }))} placeholder="Reason / evidence note for HOLD (min 8)" className="mb-2 w-full rounded-lg border border-line bg-elevated p-2 text-xs" disabled={!canApprove} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!canApprove} onClick={() => onGate(title.id, gateDef.key, "PASS", note)}>Pass</Button>
                <Button size="sm" variant="outline" disabled={!canApprove || note.trim().length < 8} onClick={() => onGate(title.id, gateDef.key, "HOLD", note)}>Hold</Button>
              </div>
            </div>;
          })}
        </div>
        <div className="space-y-2 rounded-lg border border-line p-3">
          <label className="grid gap-1 text-xs">Title-level HOLD / BLOCK reason
            <textarea rows={2} value={reason} disabled={!canApprove} onChange={(event) => setControlReasons((current) => ({ ...current, [title.id]: event.target.value }))} className="rounded-lg border border-line bg-elevated p-2" placeholder="Reason and evidence reference (minimum 8 characters)" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!canApprove || reason.trim().length < 8} onClick={() => onRelease(title.id, "HOLD", reason)}>Place on HOLD</Button>
            <Button size="sm" variant="outline" disabled={!canApprove || reason.trim().length < 8} onClick={() => onRelease(title.id, "BLOCK", reason)}>BLOCK release</Button>
            <Button size="sm" disabled={!canApprove || reason.trim().length < 8 || !["HOLD", "BLOCK"].includes(control?.status ?? "")} onClick={() => onRelease(title.id, "RELEASE", reason)}>Release control</Button>
          </div>
          {control ? <p className="text-xs text-muted">Last control: {control.status} · {control.actor ?? "Unknown actor"} · {control.at ?? "Timestamp unavailable"} · {control.reason ?? ""}</p> : null}
          <div className="border-t border-line pt-3">
            <Button size="sm" disabled={!canApprove || !publishReady} onClick={() => onPublish(title.id)}>Publish to Buyer Gallery</Button>
            {!publishReady ? <p className="mt-2 text-xs text-muted">Publication is locked until lifecycle, approved grant/legal link, destination package, all four gates and release control are ready.</p> : null}
          </div>
          {!canApprove ? <p className="text-xs text-muted">Super Admin approval permission required.</p> : null}
        </div>
      </div>;
    })}
  </section>;
}
