import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StoryConceptDesk } from "@/components/bridge/story-concept-desk";
import { hasPermission } from "@/lib/bridge/rbac";
import type { BridgeActor } from "@/lib/bridge/session";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";
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
  const workflowReview = useMutation({
    mutationFn: reviewTitleWorkflow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const gate = useMutation({
    mutationFn: setBuyerPublicationGate,
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
        <ReviewQueue title="QC Review" description="Review verified current assets before rights review." stage="QC" titles={qcQueue}
          grants={data.rights} canAct={hasPermission(actor, "title.qc_review")} mutation={workflowReview} />
      ) : activeTab === "Rights" ? (
        <ReviewQueue title="Rights Review" description="Select a DRAFT grant and record the legal evidence review before licensing." stage="LEGAL" titles={rightsQueue}
          grants={data.rights} canAct={hasPermission(actor, "title.rights_review")} mutation={workflowReview} />
      ) : activeTab === "Assets" ? (
        <SimpleTable title="Assets" description={data.assets.length + " base assets · " + data.assetVersions.length + " versioned assets"}
          rows={data.assets} fields={["kind", "s3_key", "content_type", "byte_size"]} />
      ) : activeTab === "Buyers" ? (
        <BuyerRelease titles={data.titles} canApprove={hasPermission(actor, "title.approve")}
          onGate={(titleId, gateName) => gate.mutate({ data: { titleId, gate: gateName as "OTT", decision: "PASS" } })} />
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
function ReviewQueue({ title, description, titles, stage, grants, canAct, mutation }: {
  title: string;
  description: string;
  titles: any[];
  stage: "QC" | "LEGAL";
  grants: any[];
  canAct: boolean;
  mutation: any;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} description={description} />
      {titles.length ? titles.map((item) => (
        <WorkflowReviewCard
          key={item.id}
          title={item}
          stage={stage}
          grants={grants.filter((grant) => grant.title_id === item.id && grant.status === "DRAFT")}
          canAct={canAct}
          mutation={mutation}
        />
      )) : <Empty text="Queue is clear." />}
    </section>
  );
}

function WorkflowReviewCard({ title, stage, grants, canAct, mutation }: {
  title: any;
  stage: "QC" | "LEGAL";
  grants: any[];
  canAct: boolean;
  mutation: any;
}) {
  const [note, setNote] = useState("");
  const [grantId, setGrantId] = useState(grants[0]?.id ?? "");
  const [agreementReference, setAgreementReference] = useState("");
  const [ownershipReference, setOwnershipReference] = useState("");
  const valid = note.trim().length >= 8 && (stage === "QC" || (Boolean(grants.find((grant) => grant.id === grantId)) && agreementReference.trim().length > 0 && ownershipReference.trim().length > 0));
  const submit = (decision: "APPROVE" | "REJECT") => mutation.mutate({
    data: {
      titleId: title.id,
      stage,
      decision,
      note: note.trim(),
      ...(stage === "LEGAL" ? { grantId, agreementReference: agreementReference.trim(), ownershipReference: ownershipReference.trim() } : {}),
    },
  });

  return (
    <article className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{title.name}</p>
          <p className="mt-1 text-xs text-muted">{STATUS_LABELS[title.status] ?? title.status}</p>
        </div>
        <Link to="/title/$id" params={{ id: title.id }} className="text-sm text-accent hover:underline">Open title</Link>
      </div>
      {stage === "LEGAL" ? (
        grants.length ? (
          <label className="block space-y-1 text-sm">
            <span className="text-muted">DRAFT rights grant</span>
            <select className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={grantId} onChange={(event) => setGrantId(event.target.value)}>
              {grants.map((grant) => (
                <option key={grant.id} value={grant.id}>
                  {grant.id} · {(grant.territories ?? []).join(", ") || "No territories"} · {(grant.media ?? []).join(", ") || "No media"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-muted">No DRAFT rights grant exists. Rights approval is unavailable until a grant is submitted.</p>
        )
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Reviewer notes / evidence reference (minimum 8 characters)</span>
        <textarea className="min-h-20 w-full rounded-lg border border-line bg-bg px-3 py-2" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
      </label>
      {stage === "LEGAL" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Signed distribution / OTT agreement reference</span>
            <input className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={agreementReference} onChange={(event) => setAgreementReference(event.target.value)} maxLength={1000} placeholder="Document ID or secure evidence reference" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Signed chain-of-title / authority reference</span>
            <input className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={ownershipReference} onChange={(event) => setOwnershipReference(event.target.value)} maxLength={1000} placeholder="Document ID or secure evidence reference" />
          </label>
          <p className="text-xs text-muted sm:col-span-2">The reviewer must open and verify both signed documents. A typed reference alone is not legal approval evidence.</p>
        </div>
      ) : null}
      {canAct ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={mutation.isPending || !valid} onClick={() => submit("APPROVE")}>
            {stage === "QC" ? "Pass QC → Rights" : "Approve rights → Licensing"}
          </Button>
          <Button size="sm" variant="outline" disabled={mutation.isPending || !valid} onClick={() => submit("REJECT")}>
            {stage === "QC" ? "Return for QC corrections" : "Reject rights"}
          </Button>
        </div>
      ) : (
        <span className="text-xs text-muted">Review reserved to the designated reviewer or Super Admin.</span>
      )}
    </article>
  );
}

function SimpleTable({ title, description, rows, fields, titleName }: { title: string; description: string; rows: any[]; fields: string[]; titleName?: Map<any, any> }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} /><RecordTable rows={rows} fields={fields} titleName={titleName ?? new Map()} /></section>;
}
function BuyerRelease({ titles, canApprove, onGate }: { titles: any[]; canApprove: boolean; onGate: (titleId: string, gateName: string) => void }) {
  return <section className="space-y-3"><SectionHeader title="Buyer release" description="Pass a gate only after the required check." />{titles.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line p-4"><span>{t.name}</span>{canApprove ? <ActionButton label="Pass gate" onClick={() => onGate(t.id, "buyer")} /> : <span className="text-xs text-muted">Approval reserved to Super Admin</span>}</div>)}</section>;
}
