import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StoryConceptDesk } from "@/components/bridge/story-concept-desk";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";
import { listDuplicateReviews, openDuplicateReview, decideDuplicateReview } from "@/lib/bridge/duplicate-reconciliation";
import { bridgeWorkspaceQueryKey } from "@/lib/bridge/query-scope";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "Submissions", "Concepts", "QC", "Rights", "Assets", "Buyers", "Deliveries", "Audit"] as const;
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

function WorkstationBody({ actor }: { actor: { userId: string; organizationId?: string | null; internalRole: string | null } }) {
  const qc = useQueryClient();
  const adminQueryKey = bridgeWorkspaceQueryKey("admin-workstations", actor);
  const query = useQuery({ queryKey: adminQueryKey, queryFn: () => listAdminWorkstations() });
  const review = useMutation({
    mutationFn: reviewAdminTitle,
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
        <TitleQueue titles={data.titles} review={review} internalRole={actor.internalRole} />
      ) : activeTab === "Submissions" ? (
        <SubmissionQueue submissions={data.submissions} />
      ) : activeTab === "Concepts" ? (
        <StoryConceptDesk />
      ) : activeTab === "QC" ? (
        <ReviewQueue stage="QC" title="QC Review" description="Review technical quality before rights review." titles={qcQueue}
          actions={[["PASS", "Pass QC"], ["FAIL", "Return for rework"]]} mutation={review} />
      ) : activeTab === "Rights" ? (
        <ReviewQueue stage="LEGAL" grants={data.rights} title="Rights Review" description="Select a saved draft rights agreement, then verify ownership, territory, language and window." titles={rightsQueue}
          actions={[["APPROVE", "Approve rights"], ["REJECT", "Reject rights"]]} mutation={review} />
      ) : activeTab === "Assets" ? (
        <SimpleTable title="Assets" description={data.assets.length + " base assets · " + data.assetVersions.length + " versioned assets"}
          rows={data.assets} fields={["kind", "s3_key", "content_type", "byte_size"]} />
      ) : activeTab === "Buyers" ? (
        <BuyerRelease titles={data.titles} qc={data.qc} legal={data.legal} gate={gate}
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

function TitleQueue({ titles, review, internalRole }: { titles: any[]; review: any; internalRole: string | null }) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Titles" description="One canonical Title ID from intake through delivery." />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {titles.length ? titles.slice(0, 100).map((title) => (
          <div key={title.id} className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{title.name}</p>
              <p className="mt-1 text-xs text-muted">{STATUS_LABELS[title.status] ?? title.status} · {title.language}</p>
              <p className="mt-1 text-xs text-muted">Owner: {title.owner_display_name || title.owner_user_id} · {title.owner_account_type}{title.owner_organization_name ? ` · ${title.owner_organization_name}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {title.status === "PREPARING" && internalRole === "super_admin" ? <ActionButton label="Accept → QC" onClick={() => review.mutate({ data: { titleId: title.id, decision: "ACCEPT" } })} disabled={review.isPending} /> : null}
              <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">Open</Link>
            </div>
          </div>
        )) : <Empty text="No titles in the Bridge catalog." />}
      </div>
    </section>
  );
}

function SubmissionQueue({ submissions }: { submissions: any[] }) {
  if (!submissions.length) return <section className="space-y-3"><SectionHeader title="Incoming finished-film submissions" description="Submitted film records and owner context from the existing intake table." /><Empty text="No finished-film intake records are currently available." /></section>;
  return (
    <section className="space-y-3">
      <SectionHeader title="Incoming finished-film submissions" description={`${submissions.length} persisted submissions · Story / Concept submissions remain in their own queue.`} />
      <div className="space-y-3">
        {submissions.map((item) => (
          <article key={item.title_id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{item.title_name || item.title_id}</p>
                <p className="mt-1 text-xs text-muted">{STATUS_LABELS[item.status] ?? item.status} · {item.owner_account_type}</p>
                <p className="mt-1 text-sm">{item.owner_display_name || item.owner_user_id}{item.owner_organization_name ? ` · ${item.owner_organization_name}` : ""}</p>
                <p className="mt-1 break-all text-xs text-muted">{item.owner_email || "Owner email unavailable"}</p>
              </div>
              <Link to="/title/$id" params={{ id: item.title_id }} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong">Open submission</Link>
            </div>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <span>Authority: {item.authority_type}</span>
              <span>Evidence: {item.authorization_evidence_type}</span>
              <span>Owner confirmation: {item.authorization_confirmed ? "Submitted — review required" : "Not confirmed"}</span>
              <span>Buyer channels: {(Array.isArray(item.buyer_channels) ? item.buyer_channels.join(", ") : "") || "None specified"}</span>
              <span>Screener: {item.screener_mode}</span>
              <span>Submitted: {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "Unknown"}</span>
            </div>
            <p className="mt-3 text-xs text-muted">Submission metadata is not an approval. QC, rights evidence, legal review and publication gates remain separate.</p>
          </article>
        ))}
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
function ReviewQueue({ stage, title, description, titles, actions, mutation, grants = [] }: {
  stage: "QC" | "LEGAL";
  title: string;
  description: string;
  titles: any[];
  actions: [string, string][];
  mutation: any;
  grants?: any[];
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [grantByTitle, setGrantByTitle] = useState<Record<string, string>>({});
  return (
    <section className="space-y-3">
      <SectionHeader title={title} description={description} />
      {titles.length ? titles.map((item) => {
        const draftGrants = grants.filter((grant) => grant.title_id === item.id && grant.status === "DRAFT");
        const grantId = grantByTitle[item.id] ?? "";
        const note = notes[item.id]?.trim() ?? "";
        return (
          <article key={item.id} className="space-y-3 rounded-2xl border border-line p-4">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-xs text-muted">Owner: {item.owner_display_name || item.owner_user_id} · {item.owner_account_type}{item.owner_organization_name ? ` · ${item.owner_organization_name}` : ""}</p>
            </div>
            {stage === "LEGAL" ? (
              <label className="block space-y-1 text-xs text-muted">
                <span>Draft rights agreement</span>
                <select value={grantId} onChange={(event) => setGrantByTitle((current) => ({ ...current, [item.id]: event.target.value }))}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg">
                  <option value="">Select a saved draft agreement</option>
                  {draftGrants.map((grant) => <option key={grant.id} value={grant.id}>{grant.grant_type} · {(grant.territories ?? []).join(", ") || "Territory not set"} · {grant.window_end ? new Date(grant.window_end).toLocaleDateString() : "No end date"}</option>)}
                </select>
                {!draftGrants.length ? <span className="block">No draft rights agreement exists for this title. Legal approval remains blocked.</span> : null}
              </label>
            ) : null}
            <label className="block space-y-1 text-xs text-muted">
              <span>Review note (minimum 8 characters; saved to the audit trail)</span>
              <textarea value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                maxLength={2000} rows={2} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg" placeholder="Record the reason for this decision…" />
            </label>
            <div className="flex flex-wrap gap-2">
              {actions.map(([decision, label]) => (
                <ActionButton key={decision} label={label}
                  disabled={mutation.isPending || note.length < 8 || (stage === "LEGAL" && (!grantId || !draftGrants.some((grant) => grant.id === grantId)))}
                  onClick={() => mutation.mutate({ data: { titleId: item.id, decision, notes: note, ...(stage === "LEGAL" ? { grantId } : {}) } })} />
              ))}
            </div>
          </article>
        );
      }) : <Empty text="Queue is clear." />}
    </section>
  );
}
function SimpleTable({ title, description, rows, fields, titleName }: { title: string; description: string; rows: any[]; fields: string[]; titleName?: Map<any, any> }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} /><RecordTable rows={rows} fields={fields} titleName={titleName ?? new Map()} /></section>;
}
function BuyerRelease({ titles, onGate }: { titles: any[]; qc?: any; legal?: any; gate?: any; onGate: (titleId: string, gateName: string) => void }) {
  return <section className="space-y-3"><SectionHeader title="Buyer release" description="Pass a gate only after the required check." />{titles.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line p-4"><span>{t.name}</span><ActionButton label="Pass gate" onClick={() => onGate(t.id, "buyer")} /></div>)}</section>;
}
