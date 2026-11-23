import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { archiveDraftTitle, listArchivedDraftTitles, listTitles, restoreArchivedDraftTitle } from "@/lib/bridge/titles";
import { archiveOwnerSubmission, listOwnerSubmissionQueue, reviewOwnerSubmission } from "@/lib/bridge/title-owner-submissions";

export function SuperAdminArchiveDesk() {
  const qc=useQueryClient();
  const titles=useQuery({queryKey:["bridge-titles"],queryFn:()=>listTitles()});
  const archived=useQuery({queryKey:["bridge-archived-titles"],queryFn:()=>listArchivedDraftTitles()});
  const [target,setTarget]=useState<{id:string;name:string}|null>(null);
  const [reason,setReason]=useState("");
  const [restoreTarget,setRestoreTarget]=useState<string|null>(null);
  const [restoreReason,setRestoreReason]=useState("");
  const archive=useMutation({
    mutationFn:()=>archiveDraftTitle({data:{titleId:target!.id,reason}}),
    onSuccess:()=>{toast.success("Draft archived");setTarget(null);setReason("");void qc.invalidateQueries({queryKey:["bridge-titles"]});void qc.invalidateQueries({queryKey:["bridge-archived-titles"]});void qc.invalidateQueries({queryKey:["bridge-audit"]});},
    onError:e=>toast.error(e instanceof Error?e.message:"Archive blocked"),
  });
  const restore=useMutation({
    mutationFn:()=>restoreArchivedDraftTitle({data:{titleId:restoreTarget!,reason:restoreReason}}),
    onSuccess:()=>{toast.success("Draft restored");setRestoreTarget(null);setRestoreReason("");void qc.invalidateQueries({queryKey:["bridge-titles"]});void qc.invalidateQueries({queryKey:["bridge-archived-titles"]});void qc.invalidateQueries({queryKey:["bridge-audit"]});},
    onError:e=>toast.error(e instanceof Error?e.message:"Restore blocked"),
  });
  return <section className="space-y-5">
    <div><h2 className="font-display text-2xl font-semibold">Catalog Archive / Restore</h2><p className="text-xs text-muted">Only DRAFT titles with zero linked dependencies can be archived. No hard deletion is available.</p></div>
    {titles.isError||archived.isError?<p role="alert">Archive catalog unavailable. Refresh to retry.</p>:null}
    <div className="rounded-xl border border-line bg-surface divide-y divide-line">
      {(titles.data?.titles??[]).filter(t=>t.status==="DRAFT").map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{t.name}</strong><p className="text-xs text-muted">{t.id} · DRAFT</p></div><Button type="button" size="sm" variant="outline" onClick={()=>setTarget({id:t.id,name:t.name})}>Archive Draft</Button></div>)}
      {!(titles.data?.titles??[]).some(t=>t.status==="DRAFT")?<p className="p-4 text-sm text-muted">No active drafts available to archive.</p>:null}
    </div>
    <div><h3 className="font-semibold">Archived drafts</h3><div className="mt-2 rounded-xl border border-line bg-surface divide-y divide-line">
      {(archived.data?.titles??[]).map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{t.name}</strong><p className="text-xs text-muted">{t.archive_reason}</p></div><Button type="button" size="sm" variant="outline" onClick={()=>setRestoreTarget(t.id)}>Restore</Button></div>)}
      {!(archived.data?.titles??[]).length?<p className="p-4 text-sm text-muted">No archived drafts.</p>:null}
    </div></div>
    {target?<div role="dialog" aria-modal="true" className="rounded-xl border border-line bg-surface p-4 space-y-3"><h3 className="font-semibold">Archive {target.name}?</h3><p className="text-sm text-muted">Server-side dependency checks must pass. Any asset, QC, legal, rights, payment, entitlement, delivery or unknown dependency blocks the operation.</p><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} minLength={3} maxLength={2000} placeholder="Mandatory reason" className="w-full rounded-lg border border-line bg-elevated p-3"/><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>setTarget(null)}>Cancel</Button><Button type="button" disabled={reason.trim().length<3||archive.isPending} onClick={()=>archive.mutate()}>Confirm Archive</Button></div></div>:null}
    {restoreTarget?<div role="dialog" aria-modal="true" className="rounded-xl border border-line bg-surface p-4 space-y-3"><h3 className="font-semibold">Restore archived draft?</h3><textarea value={restoreReason} onChange={e=>setRestoreReason(e.target.value)} rows={3} minLength={3} maxLength={2000} placeholder="Mandatory restore reason" className="w-full rounded-lg border border-line bg-elevated p-3"/><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>setRestoreTarget(null)}>Cancel</Button><Button type="button" disabled={restoreReason.trim().length<3||restore.isPending} onClick={()=>restore.mutate()}>Confirm Restore</Button></div></div>:null}
  </section>;
}

export function OwnerSubmissionDesk() {
  const qc=useQueryClient();
  const queue=useQuery({queryKey:["owner-submission-queue"],queryFn:()=>listOwnerSubmissionQueue()});
  const [reason,setReason]=useState("");
  const review=useMutation({
    mutationFn:({titleId,submissionKind,decision}:{titleId:string;submissionKind:"finished_film"|"story_concept";decision:"ACCEPTED_INTAKE"|"REQUEST_CHANGES"|"REJECTED"})=>reviewOwnerSubmission({data:{titleId,submissionKind,decision,reason}}),
    onSuccess:()=>{toast.success("Submission decision recorded");setReason("");void qc.invalidateQueries({queryKey:["owner-submission-queue"]});void qc.invalidateQueries({queryKey:["bridge-audit"]});},
    onError:e=>toast.error(e instanceof Error?e.message:"Decision failed"),
  });
  const archive=useMutation({
    mutationFn:({titleId,submissionKind}:{titleId:string;submissionKind:"finished_film"|"story_concept"})=>archiveOwnerSubmission({data:{titleId,submissionKind,reason}}),
    onSuccess:()=>{toast.success("Submission archived");setReason("");void qc.invalidateQueries({queryKey:["owner-submission-queue"]});void qc.invalidateQueries({queryKey:["bridge-audit"]});},
    onError:e=>toast.error(e instanceof Error?e.message:"Archive failed"),
  });
  if(queue.isPending)return <p className="text-sm text-muted">Loading owner submissions…</p>;
  if(queue.isError)return <p role="alert">Owner submission queue unavailable.</p>;
  const items=queue.data?.submissions??[];
  return <section className="space-y-4">
    <div><h2 className="font-display text-2xl font-semibold">Owner Submissions</h2><p className="text-xs text-muted">Intake acceptance does not grant QC, Rights, Legal or publication approval.</p></div>
    {items.length?<><label className="block text-sm">Mandatory decision / archive reason<textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} minLength={3} maxLength={2000} className="mt-1 w-full rounded-lg border border-line bg-elevated p-3"/></label>
      {items.map(s=><article key={s.title_id+":"+s.submission_kind} className="rounded-xl border border-line bg-surface p-4 space-y-3"><div className="flex flex-wrap justify-between gap-2"><strong>{s.title_name}</strong><span className="text-xs text-muted">{s.submission_kind} · {s.submission_status}</span></div><p className="text-xs text-muted">{s.owner_display_name||s.owner_email||s.owner_organization_name||"Owner"} · {s.title_status}</p><div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={reason.trim().length<3||review.isPending} onClick={()=>review.mutate({titleId:s.title_id,submissionKind:s.submission_kind,decision:"REQUEST_CHANGES"})}>Request Changes</Button>
        <Button size="sm" variant="outline" disabled={reason.trim().length<3||review.isPending} onClick={()=>review.mutate({titleId:s.title_id,submissionKind:s.submission_kind,decision:"REJECTED"})}>Reject</Button>
        <Button size="sm" variant="outline" disabled={reason.trim().length<3||review.isPending} onClick={()=>review.mutate({titleId:s.title_id,submissionKind:s.submission_kind,decision:"ACCEPTED_INTAKE"})}>Accept into Intake</Button>
        <Button size="sm" variant="outline" disabled={reason.trim().length<3||archive.isPending} onClick={()=>archive.mutate({titleId:s.title_id,submissionKind:s.submission_kind})}>Archive Submission</Button>
      </div></article>)}</>:<p className="text-sm text-muted">No pending owner submissions.</p>}
  </section>;
}
