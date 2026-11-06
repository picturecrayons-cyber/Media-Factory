import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StoryConceptDesk } from "@/components/bridge/story-concept-desk";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";
import { listDuplicateReviews, openDuplicateReview, decideDuplicateReview } from "@/lib/bridge/duplicate-reconciliation";
import {
  listTestDataCleanupCandidates,
  verifyOciAssetForAdmin,
  verifyOciBucketForAdmin,
} from "@/lib/bridge/admin-workstations";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "Concepts", "QC", "Rights", "Buyers", "Deliveries", "Internal Audit"] as const;
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

function WorkstationBody({ actor }: { actor: { internalRole: string | null } }) {
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
      ) : activeTab === "Concepts" ? (
        <StoryConceptDesk />
      ) : activeTab === "QC" ? (
        <ReviewQueue title="QC Review" description="Review technical quality before rights review." titles={qcQueue}
          actions={[["PASS", "Approve → Rights"], ["FAIL", "Fail QC"]]} mutation={review} />
      ) : activeTab === "Rights" ? (
        <ReviewQueue title="Rights Review" description="Clear ownership, territory, language and window before licensing." titles={rightsQueue}
          actions={[["APPROVE", "Approve → Licensing"], ["REJECT", "Reject"]]} mutation={review} />
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
      ) : activeTab === "Internal Audit" ? (
        <InternalAudit assets={data.assets} isStorageAdmin={actor.internalRole === "admin" || actor.internalRole === "super_admin"} />
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
function ReviewQueue({ title, description, titles, actions, mutation }: { title: string; description: string; titles: any[]; actions: [string, string][]; mutation: any }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} />{titles.length ? titles.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line p-4"><span>{t.name}</span><div className="flex gap-2">{actions.map(([decision, label]) => <ActionButton key={decision} label={label} disabled={mutation.isPending} onClick={() => mutation.mutate({ data: { titleId: t.id, decision } })} />)}</div></div>) : <Empty text="Queue is clear." />}</section>;
}
function SimpleTable({ title, description, rows, fields, titleName }: { title: string; description: string; rows: any[]; fields: string[]; titleName?: Map<any, any> }) {
  return <section className="space-y-3"><SectionHeader title={title} description={description} /><RecordTable rows={rows} fields={fields} titleName={titleName ?? new Map()} /></section>;
}
function BuyerRelease({ titles, onGate }: { titles: any[]; qc?: any; legal?: any; gate?: any; onGate: (titleId: string, gateName: string) => void }) {
  return <section className="space-y-3"><SectionHeader title="Buyer release" description="Pass a gate only after the required check." />{titles.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line p-4"><span>{t.name}</span><ActionButton label="Pass gate" onClick={() => onGate(t.id, "buyer")} /></div>)}</section>;
}


function InternalAudit({ assets, isStorageAdmin }: { assets: any[]; isStorageAdmin: boolean }) {
  const qc = useQueryClient();
  const bucket = useMutation({
    mutationFn: () => verifyOciBucketForAdmin(),
  });
  const cleanup = useQuery({
    queryKey: ["bridge-test-data-cleanup-preview"],
    queryFn: () => listTestDataCleanupCandidates(),
    enabled: isStorageAdmin,
  });
  const verifyAsset = useMutation({
    mutationFn: (assetId: string) => verifyOciAssetForAdmin({ data: { assetId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const storageAssets = assets.filter((asset) => asset.verified_object_key || asset.s3_key);
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h3 className="font-display text-2xl font-semibold">Storage provenance & OCI verification</h3>
          <p className="text-sm text-muted">Internal-only view of verified object references, bucket metadata and read-only provider checks.</p>
        </div>
        {!isStorageAdmin ? (
          <p className="rounded-xl border border-line p-4 text-sm text-muted">Storage audit and cleanup preview require Admin or Super Admin privileges.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={bucket.isPending} onClick={() => bucket.mutate()}>
                {bucket.isPending ? "Checking OCI…" : "Verify OCI bucket access"}
              </Button>
              {bucket.data ? <span className="text-xs text-muted">Verified {bucket.data.verifiedAt} · {bucket.data.region}</span> : null}
            </div>
            {bucket.isError ? <p role="alert" className="text-sm text-red-500">{bucket.error instanceof Error ? bucket.error.message : "OCI bucket verification failed"}</p> : null}
            {bucket.data ? (
              <dl className="grid gap-2 rounded-xl border border-line p-3 text-xs sm:grid-cols-2">
                <div><dt className="font-semibold">Provider</dt><dd>{bucket.data.provider}</dd></div>
                <div><dt className="font-semibold">Bucket</dt><dd className="break-all">{bucket.data.bucket}</dd></div>
                <div><dt className="font-semibold">Namespace</dt><dd className="break-all">{bucket.data.namespace}</dd></div>
                <div><dt className="font-semibold">Endpoint</dt><dd className="break-all">{bucket.data.endpoint}</dd></div>
              </dl>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="border-b border-line text-muted"><tr>
                  {["Asset", "Kind", "Bucket", "Namespace", "Region", "SHA-256", "Verified at", "OCI check"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {storageAssets.slice(0, 100).map((asset) => (
                    <tr key={asset.id}>
                      <td className="max-w-[220px] break-all px-3 py-3 font-mono">{asset.verified_object_key ?? asset.s3_key ?? asset.id}</td>
                      <td className="px-3 py-3">{asset.kind}</td>
                      <td className="px-3 py-3">{asset.storage_bucket ?? "—"}</td>
                      <td className="px-3 py-3">{asset.storage_namespace ?? "—"}</td>
                      <td className="px-3 py-3">{asset.storage_region ?? "—"}</td>
                      <td className="max-w-[180px] break-all px-3 py-3">{asset.checksum_sha256 ?? "—"}</td>
                      <td className="px-3 py-3">{asset.storage_verified_at ? String(asset.storage_verified_at) : "—"}</td>
                      <td className="px-3 py-3">
                        <Button size="sm" variant="outline" disabled={verifyAsset.isPending || !asset.verified_object_key} onClick={() => verifyAsset.mutate(asset.id)}>Verify object</Button>
                      </td>
                    </tr>
                  ))}
                  {!storageAssets.length ? <tr><td colSpan={8} className="px-3 py-5 text-muted">No asset provenance records returned.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {verifyAsset.data ? <p role="status" className="text-sm">Last object check: {verifyAsset.data.matchesRecordedSize ? "PASS — recorded size matches OCI" : "FAIL — recorded size differs from OCI"} ({verifyAsset.data.observedByteSize} bytes)</p> : null}
            {verifyAsset.isError ? <p role="alert" className="text-sm text-red-500">{verifyAsset.error instanceof Error ? verifyAsset.error.message : "Object verification failed"}</p> : null}
          </>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h3 className="font-display text-2xl font-semibold">Test-data cleanup preview</h3>
          <p className="text-sm text-muted">Dry-run candidates only. This tool does not delete database rows, files, multipart sessions or storage objects.</p>
        </div>
        {!isStorageAdmin ? <p className="text-sm text-muted">Admin or Super Admin access required.</p> : cleanup.isPending ? <p className="text-sm text-muted">Scanning candidate titles…</p> : cleanup.isError ? <p role="alert" className="text-sm text-red-500">Cleanup inventory unavailable.</p> : (
          <>
            <p className="text-sm font-semibold">{cleanup.data.candidates.length} possible test-data title(s) found.</p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-line text-muted"><tr>
                  {["Title", "Status", "Assets", "Rights", "Legal", "Packages", "Publications"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {cleanup.data.candidates.map((item: any) => <tr key={item.id}>
                    <td className="px-3 py-3"><span className="font-semibold">{item.name}</span><span className="mt-1 block break-all font-mono text-muted">{item.id}</span></td>
                    <td className="px-3 py-3">{item.status}</td>
                    <td className="px-3 py-3">{item.asset_count}</td>
                    <td className="px-3 py-3">{item.rights_count}</td>
                    <td className="px-3 py-3">{item.legal_count}</td>
                    <td className="px-3 py-3">{item.package_count}</td>
                    <td className="px-3 py-3">{item.publication_count}</td>
                  </tr>)}
                  {!cleanup.data.candidates.length ? <tr><td colSpan={7} className="px-3 py-5 text-muted">No obvious test/demo/fixture/sample title names found. This is not proof that no test data exists.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Deletion remains blocked pending a separately approved, dependency-aware cleanup plan and exact environment confirmation.</p>
          </>
        )}
      </section>
    </div>
  );
}
