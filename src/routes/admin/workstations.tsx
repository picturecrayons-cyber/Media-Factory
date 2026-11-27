import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StoryConceptDesk } from "@/components/bridge/story-concept-desk";
import { hasPermission } from "@/lib/bridge/rbac";
import type { BridgeActor } from "@/lib/bridge/session";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";
import { listDuplicateReviews, openDuplicateReview, decideDuplicateReview } from "@/lib/bridge/duplicate-reconciliation";
import { listLoopPublicationReadiness, authorizeLoopPublication } from "@/lib/bridge/loop-publication";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "Concepts", "QC", "Rights", "Assets", "Buyers", "Deliveries", "LOOP Publishing", "Audit"] as const;
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
        <ReviewQueue title="Rights Review" description="Clear ownership, territory, language and window before licensing." titles={rightsQueue}
          canAct={hasPermission(actor, "title.rights_review")} actions={[["APPROVE", "Approve → Licensing"], ["REJECT", "Reject"]]} mutation={review} />
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
      ) : activeTab === "LOOP Publishing" ? (
        <LoopPublishing actor={actor} />
      ) : (
        <SimpleTable title="Audit History" description="Persisted operator activity. No UI-only decisions."
          rows={data.audit} fields={["action", "entity_type", "entity_id", "actor_user_id", "created_at"]} />
      )}

      {review.isError || gate.isError ? <p className="rounded-xl border border-line p-4 text-sm">Action failed: {String(review.error ?? gate.error)}</p> : null}
    </div>
  );
}


const LOOP_PUBLISHING_TARGETS = [
  { id: "f15e0a5385aaf8365f6ad730de747da0", name: "Pranayam 1947" },
  { id: "cb8c141dc72d727a53a4f35d8851e100", name: "Jananam 1947 Pranayam Thudarunnu" },
  { id: "858f0ec5a11bc9acd2e9c20266541a3a", name: "Malayalakkara Residency" },
] as const;

function LoopPublishing({ actor }: { actor: BridgeActor }) {
  const qc = useQueryClient();
  const canPublish = hasPermission(actor, "loop.publish");
  const readiness = useQuery({
    queryKey: ["loop-publication-readiness"],
    queryFn: () => listLoopPublicationReadiness(),
  });
  const publish = useMutation({
    mutationFn: authorizeLoopPublication,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] }),
        qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
      ]);
    },
  });

  const records = readiness.data?.titles ?? [];
  return (
    <section className="space-y-4">
      <div>
        <SectionHeader
          title="Crayons LOOP · Publishing control"
          description="Owner-authorized requests for the three designated titles. Each request is checked against current Bridge rights, QC, legal approval, commercial terms, packaging, curation and delivery evidence on the server."
        />
        <p className="mt-2 rounded-xl border border-line bg-surface p-3 text-xs text-muted">
          This control requests WORLDWIDE TVOD distribution. It does not mark missing evidence as complete, create legal approval, or bypass the fail-closed publication contract. LOOP becomes public only when the server confirms authorization.
        </p>
      </div>
      {readiness.isPending ? <Empty text="Loading current Bridge-to-LOOP publication status…" /> : null}
      {readiness.isError ? <Empty text="Publication readiness could not be loaded. No publication action is available until the status can be verified." /> : null}
      {!readiness.isPending && !readiness.isError ? LOOP_PUBLISHING_TARGETS.map((target) => {
        const record = records.find((item: any) => item.id === target.id);
        return (
          <LoopPublicationCard
            key={target.id}
            target={target}
            record={record}
            canPublish={canPublish}
            pending={publish.isPending}
            onAuthorize={(request) => publish.mutate({ data: request })}
          />
        );
      }) : null}
      {!canPublish ? <p className="text-xs text-muted">Your account does not have the loop.publish permission. Ask a Bridge administrator to review your role.</p> : null}
      {publish.isError ? <p role="alert" className="break-words rounded-xl border border-line p-4 text-sm">Publication request blocked: {publish.error instanceof Error ? publish.error.message : "The server rejected the request."}</p> : null}
      {publish.isSuccess ? <p role="status" className="rounded-xl border border-line p-4 text-sm">Bridge accepted the publication authorization request. Refreshing the persisted status; this does not itself certify public playback.</p> : null}
    </section>
  );
}

function LoopPublicationCard({
  target, record, canPublish, pending, onAuthorize,
}: {
  target: { id: string; name: string };
  record: any;
  canPublish: boolean;
  pending: boolean;
  onAuthorize: (request: {
    bridgeTitleId: string;
    destination: "CRAYONS_LOOP";
    territories: string[];
    languages: string[];
    exploitationModels: ("TVOD")[];
    windowStart: string;
    windowEnd: string;
    accessTier: "TVOD";
  }) => void;
}) {
  const [language, setLanguage] = useState(record?.language || "");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const blockers: string[] = record?.blockers ?? ["Title record was not returned by the Bridge readiness service."];
  const published = record?.publication?.published === true &&
    ["AUTHORIZED", "LIVE"].includes(record?.publication?.authorizationStatus);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPublish || !language.trim() || !windowStart || !windowEnd) return;
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return;
    onAuthorize({
      bridgeTitleId: target.id,
      destination: "CRAYONS_LOOP",
      territories: ["WORLDWIDE"],
      languages: [language.trim()],
      exploitationModels: ["TVOD"],
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      accessTier: "TVOD",
    });
  }

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">{target.name}</h4>
          <p className="mt-1 text-xs text-muted">Bridge title ID · {target.id}</p>
          <p className="mt-1 text-xs text-muted">Bridge status: {record?.bridgeStatus ?? "NOT VERIFIED"}</p>
        </div>
        <span className="rounded-full border border-line px-3 py-1 text-xs">
          {published ? "Publication record active" : record?.publication?.authorizationStatus ?? "Not authorized"}
        </span>
      </div>
      {record ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Current blockers / checks</p>
          {blockers.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{blockers.map((item, index) => <li key={index}>{item}</li>)}</ul>
          ) : <p className="text-sm text-muted">No blockers reported by the readiness projection. The authorization endpoint will re-check all gates transactionally.</p>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">This exact Bridge title ID is not present in the current readiness response. Authorization will remain unavailable until the record can be verified.</p>
      )}
      <form onSubmit={submit} className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted">
          Distribution language
          <input required value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Confirm title language" className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm text-fg" />
        </label>
        <label className="text-xs font-medium text-muted">
          Territory
          <input value="WORLDWIDE" readOnly className="mt-1 h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-muted" />
        </label>
        <label className="text-xs font-medium text-muted">
          Distribution window starts
          <input required type="datetime-local" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm text-fg" />
        </label>
        <label className="text-xs font-medium text-muted">
          Distribution window ends
          <input required type="datetime-local" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm text-fg" />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">Model: TVOD · Server-side revalidation required</p>
          <Button type="submit" disabled={!canPublish || !record || pending || !language.trim() || !windowStart || !windowEnd}>
            {pending ? "Checking…" : published ? "Revalidate & update authorization" : "Run checks & request authorization"}
          </Button>
        </div>
      </form>
    </article>
  );
}

function TitleQueue({ titles, review }: { titles: any[]; review: any }) {
  const [view, setView] = useState<"gallery" | "list">("gallery");
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionHeader title="Master title catalog" description={`${titles.length} recorded titles · All production stages remain visible here until separately authorized for a destination.`} />
        </div>
        <div className="flex gap-2" role="group" aria-label="Catalog view">
          <Button size="sm" variant={view === "gallery" ? "default" : "outline"} onClick={() => setView("gallery")} aria-pressed={view === "gallery"}>Gallery view</Button>
          <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")} aria-pressed={view === "list"}>List view</Button>
        </div>
      </div>
      {!titles.length ? <Empty text="No titles in the Bridge master catalog." /> : view === "gallery" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {titles.map((title) => (
            <article key={title.id} className="flex min-h-44 flex-col rounded-2xl border border-line bg-surface p-4">
              <div className="mb-3 flex aspect-[16/9] items-center justify-center rounded-xl border border-dashed border-line bg-elevated text-xs text-muted">
                Poster preview is available in the title workspace
              </div>
              <div className="flex-1">
                <p className="font-semibold">{title.name}</p>
                <p className="mt-1 text-xs text-muted">{STATUS_LABELS[title.status] ?? title.status} · {title.language || "Language not set"}</p>
                <p className="mt-1 break-all text-[11px] text-muted">{title.id}</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {title.status === "PREPARING" ? <ActionButton label="Accept → QC" onClick={() => review.mutate({ data: { titleId: title.id, decision: "ACCEPT" } })} disabled={review.isPending} /> : null}
                <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">Open title</Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {titles.map((title) => (
            <div key={title.id} className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{title.name}</p>
                <p className="mt-1 text-xs text-muted">{STATUS_LABELS[title.status] ?? title.status} · {title.language || "Language not set"} · {title.id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {title.status === "PREPARING" ? <ActionButton label="Accept → QC" onClick={() => review.mutate({ data: { titleId: title.id, decision: "ACCEPT" } })} disabled={review.isPending} /> : null}
                <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">Open title</Link>
              </div>
            </div>
          ))}
        </div>
      )}
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
function BuyerRelease({ titles, canApprove, onGate }: { titles: any[]; canApprove: boolean; onGate: (titleId: string, gateName: string) => void }) {
  return <section className="space-y-3"><SectionHeader title="Buyer release" description="Pass a gate only after the required check." />{titles.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line p-4"><span>{t.name}</span>{canApprove ? <ActionButton label="Pass gate" onClick={() => onGate(t.id, "buyer")} /> : <span className="text-xs text-muted">Approval reserved to Super Admin</span>}</div>)}</section>;
}
