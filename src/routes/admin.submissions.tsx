import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminSubmissions, getAdminSubmission, listStoryConceptSubmissions } from "@/lib/bridge/submissions";

export const Route = createFileRoute("/admin/submissions")({ component: AdminSubmissions });

function AdminSubmissions() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
          return <BridgeShell actor={actor} title="Submissions"><p className="rounded-2xl border border-line bg-surface p-6 text-sm">Admin access required.</p></BridgeShell>;
        }
        return <BridgeShell actor={actor} title="Submissions"><SubmissionDesk /></BridgeShell>;
      }}
    </RequireBridge>
  );
}

function SubmissionDesk() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin-submissions", search, status],
    queryFn: () => listAdminSubmissions({ data: { search, status, limit: 100 } }),
  });
  const storyConceptsQ = useQuery({
    queryKey: ["admin-story-concept-submissions"],
    queryFn: () => listStoryConceptSubmissions(),
  });
  const detail = useQuery({
    queryKey: ["admin-submission-detail", selected],
    queryFn: () => getAdminSubmission({ data: { titleId: selected! } }),
    enabled: Boolean(selected),
  });
  const submissions = query.data?.submissions ?? [];
  const submission = detail.data?.submission as any;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Crayons Bridge · Admin</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Title submissions</h2>
        <p className="mt-1 text-sm text-muted">Search and filter incoming titles. Inspect verified storage proof, QC notes and notification delivery status.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, ID or owner" className="h-11 rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent">
            <option value="">All statuses</option>
            {["DRAFT","UPLOADING","PREPARING","QC_REVIEW","RIGHTS_REVIEW","LICENSING_READY","LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED","DELIVERED"].map((s) => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}
          </select>
        </div>
      </section>

      {query.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-sm">Submissions could not be loaded: {String(query.error)}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line p-4 text-sm font-semibold">{query.isPending ? "Loading…" : `${submissions.length} submissions`}</div>
          <div className="divide-y divide-line">
            {submissions.map((item: any) => (
              <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={"block w-full p-4 text-left hover:bg-elevated " + (selected === item.id ? "bg-elevated" : "")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><p className="mt-1 truncate text-xs text-muted">{item.owner_name ?? item.owner_user_id} · {item.owner_account_type}</p><p className="mt-1 break-all text-[11px] text-muted">{item.id}</p></div>
                  <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[11px]">{String(item.status).replaceAll("_"," ")}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                  <span>{Array.isArray(item.storage_proof) ? item.storage_proof.filter((a:any)=>a.verified).length : 0} verified assets</span>
                  <span>{Array.isArray(item.qc_notes) ? item.qc_notes.length : 0} QC records</span>
                </div>
              </button>
            ))}
            {!query.isPending && !query.isError && submissions.length === 0 ? <p className="p-5 text-sm text-muted">No submissions match this search.</p> : null}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4">
          {!selected ? <p className="text-sm text-muted">Select a submission to inspect its evidence.</p> : detail.isPending ? <p className="text-sm text-muted">Loading submission detail…</p> : detail.isError || !submission ? <p role="alert" className="text-sm text-muted">Submission detail unavailable.</p> : (
            <div className="space-y-5">
              <div><p className="text-xs uppercase tracking-wider text-accent">Submission detail</p><h3 className="mt-1 font-display text-xl font-semibold">{submission.name}</h3><p className="mt-1 break-all text-xs text-muted">{submission.id}</p><p className="mt-2 text-sm text-muted">{submission.owner_name} · {submission.owner_email}</p><p className="mt-2 text-sm">{submission.synopsis}</p></div>
              <div>
                <h4 className="font-semibold">Storage proof</h4>
                <div className="mt-2 space-y-2">
                  {(submission.storage_proof ?? []).map((asset: any, i: number) => <div key={i} className="rounded-xl border border-line p-3 text-xs">
                    <div className="flex items-center justify-between gap-2"><strong>{asset.kind}</strong><span className={"rounded-full px-2 py-1 " + (asset.verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>{asset.verified ? "Verified" : "Failed / incomplete"}</span></div>
                    <p className="mt-1">Size: {asset.byteSize ?? "—"} bytes · Format: {asset.contentType ?? "—"}</p>
                    <p className="mt-1 break-all">SHA-256: {asset.checksumSha256 ?? "Not recorded"}</p>
                    <p className="mt-1">Verified at: {asset.verifiedAt ?? "Not verified"}</p>
                  </div>)}
                  {!(submission.storage_proof ?? []).length ? <p className="text-sm text-muted">No storage proof recorded.</p> : null}
                </div>
              </div>
              <div><h4 className="font-semibold">QC notes</h4><div className="mt-2 space-y-2">{(submission.qc_notes ?? []).map((qc:any,i:number)=><div key={i} className="rounded-xl border border-line p-3 text-xs"><strong>{qc.status}</strong><pre className="mt-2 whitespace-pre-wrap break-words text-muted">{JSON.stringify(qc.notes,null,2)}</pre><p className="mt-2 text-muted">Reviewer: {qc.reviewedBy ?? "—"} · {qc.reviewedAt ?? "—"}</p></div>)}{!(submission.qc_notes ?? []).length ? <p className="text-sm text-muted">No QC decision recorded yet.</p> : null}</div></div>
              <div><h4 className="font-semibold">Submission email</h4><div className="mt-2 space-y-2">{(submission.email_delivery ?? []).map((mail:any,i:number)=><div key={i} className="rounded-xl border border-line p-3 text-xs"><strong>{mail.status}</strong><p className="mt-1 text-muted">{mail.createdAt}</p><pre className="mt-2 whitespace-pre-wrap break-words text-muted">{mail.metadata}</pre></div>)}{!(submission.email_delivery ?? []).length ? <p className="text-sm text-muted">No delivery attempt recorded.</p> : null}</div></div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-display text-xl font-semibold">Story Concept submissions</h3>
        <p className="mt-1 text-sm text-muted">Paid status, Legal and Editorial review, and Super Admin introduction status. Story Concept download access is not exposed in this Admin queue.</p>
        {storyConceptsQ.isError ? <p role="alert" className="mt-3 text-sm">Story Concept submissions unavailable.</p> : null}
        <div className="mt-3 space-y-2">
          {(storyConceptsQ.data?.storyConcepts ?? []).map((item: any) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div><p className="text-sm font-semibold">{item.title_name}</p><p className="mt-1 text-xs text-muted">{item.owner_name ?? item.owner_user_id} · {item.owner_account_type}</p><p className="mt-1 text-xs text-muted">Fee: {item.fee_certified_at ? "PAID / VERIFIED" : "NOT PAID"} · Legal: {item.legal_status} · Editorial: {item.editorial_status}</p></div>
              <span className="rounded-full border border-line px-2 py-1 text-xs">{item.introduced_to_buyers_at ? "Introduced" : item.curation_status ?? "Pending"}</span>
            </div>
          ))}
          {!storyConceptsQ.isPending && (storyConceptsQ.data?.storyConcepts ?? []).length === 0 ? <p className="text-sm text-muted">No Story Concept submissions recorded.</p> : null}
        </div>
      </section>
    </div>
  );
}
