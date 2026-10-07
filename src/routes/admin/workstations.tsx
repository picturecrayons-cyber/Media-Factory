import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";
import { listDuplicateReviews, openDuplicateReview, decideDuplicateReview } from "@/lib/bridge/duplicate-reconciliation";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "QC", "Rights", "Assets", "Buyers", "Deliveries", "Audit"] as const;
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
          onGate={(titleId, gateName) => gate.mutate({ data: { titleId, gate: gateName, decision: "PASS" } })} />
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

  const pipelineAction = (title: any) => {
    if (title.status === "PREPARING") return { label: "Approve", decision: "ACCEPT" as const };
    if (title.status === "QC_REVIEW") return { label: "Approve", decision: "PASS" as const };
    if (title.status === "RIGHTS_REVIEW") return { label: "Approve", decision: "APPROVE" as const };
    return null;
  };

  return <div className="space-y-8">
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Titles</p>
        <h2 className="font-display text-2xl font-semibold">Simple title controls</h2>
        <p className="text-sm text-muted">Internal workflow only. Buyer-facing pages remain free of operational controls and technical details.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Workflow</th><th className="px-4 py-3">Controls</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.titles.map((title: any) => {
              const approve = pipelineAction(title);
              return (
                <tr key={title.id}>
                  <td className="px-4 py-4 font-medium">{title.name}</td>
                  <td className="px-4 py-4"><span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{title.status.replaceAll("_", " ")}</span></td>
                  <td className="px-4 py-4 text-xs text-muted">Review → Approve → Publish → License → Deliver</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <a href={`/title/${title.id}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Review</a>
                      {approve ? <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ data: { titleId: title.id, decision: approve.decision } })}>{approve.label}</Button> : null}
                      <a href="#buyer-publication" className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Publish</a>
                      <a href="#licensing" className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">License</a>
                      <a href="#deliveries" className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Deliver</a>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!data.titles.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">No titles in the pipeline.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>

    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Authoritative operations</p><h2 className="mt-2 font-display text-3xl font-semibold">Real Bridge workstations</h2><p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">Every queue below reads persisted Bridge records. Review decisions write lifecycle events and audit records; there are no UI-only approvals.</p></section>
    <section id="submissions" className="space-y-3"><div><h3 className="font-display text-2xl font-semibold">1 · Incoming Submissions</h3><p className="text-sm text-muted">Canonical title records awaiting operational acceptance.</p></div>{submissions.length ? submissions.map((t:any)=><ReviewRow key={t.id} title={t} actions={t.status==="PREPARING" ? [["ACCEPT","Accept → QC"]] : []}/>) : <Empty text="No incoming submissions."/>}</section>
    <section id="assets" className="space-y-3"><h3 className="font-display text-2xl font-semibold">2 · Titles & Assets</h3><p className="text-sm text-muted">{data.titles.length} canonical titles · {data.assets.length} base assets · {data.assetVersions.length} versioned assets.</p><RecordTable rows={data.assets.slice(0,30)} titleName={titleName} fields={["kind","s3_key","content_type","byte_size"]}/></section>
    <section id="qc" className="space-y-3"><h3 className="font-display text-2xl font-semibold">3 · Assets & QC</h3><p className="text-sm text-muted">{qcQueue.length} titles in QC review.</p>{qcQueue.length ? qcQueue.map((t:any)=><ReviewRow key={t.id} title={t} actions={[["PASS","Pass → Rights"],["FAIL","Fail QC"]]}/>) : <Empty text="QC queue is clear."/>}</section>
    <section id="rights" className="space-y-3"><h3 className="font-display text-2xl font-semibold">4 · Legal & Rights</h3><p className="text-sm text-muted">{rightsQueue.length} titles in rights review · {data.legal.length} legal cases · {data.rights.length} rights grants.</p>{rightsQueue.length ? rightsQueue.map((t:any)=><ReviewRow key={t.id} title={t} actions={[["APPROVE","Approve → Licensing"],["REJECT","Reject"]]}/>) : <Empty text="Rights queue is clear."/>}</section>
    <section id="licensing" className="space-y-3"><h3 className="font-display text-2xl font-semibold">5 · Licensing</h3><p className="text-sm text-muted">{ready.length} titles in commercial pipeline · {data.packages.length} destination packages.</p><RecordTable rows={ready} titleName={titleName} fields={["status","licensing_fee_paise","language","updated_at"]}/></section>
    <section id="deliveries" className="space-y-3"><h3 className="font-display text-2xl font-semibold">6 · Deliveries</h3><p className="text-sm text-muted">Persisted destination packages and authorization state.</p><RecordTable rows={data.packages} titleName={titleName} fields={["destination","package_version","readiness_state","commercial_model","authorized_at"]}/></section>
    <section id="users" className="space-y-3"><h3 className="font-display text-2xl font-semibold">7 · Users & Studios</h3><p className="text-sm text-muted">{data.profiles.length} Bridge profiles from the authoritative profile table. Role mutation remains controlled by the audited invite workflow.</p><RecordTable rows={data.profiles} titleName={new Map()} fields={["display_name","email","account_type","organization_name","internal_role","email_verified"]}/></section>
    <section id="audit" className="space-y-3"><h3 className="font-display text-2xl font-semibold">8 · Audit History</h3><p className="text-sm text-muted">Immutable operational events currently stored by Bridge.</p><RecordTable rows={data.audit} titleName={new Map()} fields={["action","entity_type","entity_id","actor_user_id","created_at"]}/></section>
    <section id="website" className="space-y-3"><h3 className="font-display text-2xl font-semibold">9 · Website CMS</h3><p className="text-sm text-muted">Public Bridge copy remains isolated in the existing Website CMS route.</p><a className="text-sm text-accent underline" href="/admin-cms">Open Website CMS →</a></section>
    <section id="buyer-publication" className="space-y-4">
      <div><h3 className="font-display text-2xl font-semibold">Buyer Publication · Six Gates</h3><p className="text-sm text-muted">Buyer visibility is fail-closed. Admin can certify OTT preparation, packaging, curation and delivery; QC and Legal remain separate reviewer gates.</p></div>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-3 py-3">Title</th><th className="px-3 py-3">QC</th><th className="px-3 py-3">Legal</th><th className="px-3 py-3">Operational gates</th><th className="px-3 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, 50).map((row, i) => (
              <tr key={String(row.id ?? row.user_id ?? i)}>
                {fields.map((f) => <td key={f} className="max-w-[320px] truncate px-3 py-3">
                  {f === "bridge_title_id" ? (titleName.get(row[f]) ?? row[f]) : typeof row[f] === "object" ? JSON.stringify(row[f]) : String(row[f] ?? "—")}
                </td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    <section id="loop" className="space-y-3"><h3 className="font-display text-2xl font-semibold">10 · Operational CMS / Loop Publishing</h3><p className="text-sm text-muted">{data.publications.length} persisted Bridge publication records. Authorization is server-side and requires rights, QC/master and presentation assets.</p><RecordTable rows={data.publications} titleName={titleName} fields={["authorization_status","territories","languages","exploitation_models","approved_at","revoked_at"]}/></section>
    <DuplicateReviewSection />
    {mutation.isError ? <p className="rounded-xl border border-line p-4 text-sm">Action failed: {String(mutation.error)}</p> : null}
  </div>;
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