import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { createSupportCaseFromInbound, listSuperAdminSupportDesk, updateSuperAdminSupportCase } from "@/lib/bridge/super-admin-support";

export const Route = createFileRoute("/support-communications")({component:SupportCommunications});
const STATUSES=["OPEN","IN_PROGRESS","WAITING_INTERNAL","WAITING_CUSTOMER","RESOLVED","CLOSED"] as const;
const PRIORITIES=["LOW","NORMAL","HIGH","URGENT"] as const;
function SupportCommunications(){
 return <RequireBridge allow="super_admin">{actor=><BridgeShell actor={actor} title="Support & Communications"><SupportBody/></BridgeShell>}</RequireBridge>;
}
function SupportBody(){
 const qc=useQueryClient();
 const q=useQuery({queryKey:["super-admin-support-desk"],queryFn:()=>listSuperAdminSupportDesk(),retry:false});
 const [note,setNote]=useState<Record<string,string>>({});
 const create=useMutation({mutationFn:(id:string)=>createSupportCaseFromInbound({data:{inboundEventId:id,priority:"NORMAL"}}),onSuccess:()=>qc.invalidateQueries({queryKey:["super-admin-support-desk"]})});
 const update=useMutation({mutationFn:(v:{caseId:string;status?:typeof STATUSES[number];priority?:typeof PRIORITIES[number];internalNote?:string;assignedTo?:string|null})=>updateSuperAdminSupportCase({data:v}),onSuccess:()=>qc.invalidateQueries({queryKey:["super-admin-support-desk"]})});
 return <div className="space-y-6">
  <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
   <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Super Admin · audited case workflow</p>
   <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Support queue</h2>
   <p className="mt-2 max-w-3xl text-sm text-muted">Inbound Hostinger message metadata can be converted into an internal case. Only sender, subject and bounded preview metadata are shown. No outbound customer email or invitation is sent.</p>
  </section>
  {q.isPending?<p className="rounded-xl border border-line p-5 text-sm text-muted">Loading support records…</p>:q.isError?<p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">Support schema or inbound mail records are unavailable. The support migration must be reviewed and applied in the approved STAGING gate before this workspace can operate.</p>:<>
   <p className="rounded-xl border border-line p-4 text-xs text-muted">{q.data?.mutationsEnabled ? "Support case updates are enabled by a Preview-only server feature flag." : "Case creation and updates are disabled by default. They require the support migration and a separately approved Preview-only feature flag."}</p>
   <section className="space-y-3">
    <div><h3 className="font-display text-lg font-semibold">Untriaged inbound messages</h3><p className="text-xs text-muted">Latest 100 metadata events; no message body or attachments.</p></div>
    {(q.data?.inbound??[]).map(m=><article key={m.id} className="rounded-xl border border-line bg-surface p-4">
     <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{m.subject||"(No subject)"}</p><p className="mt-1 text-xs text-muted">{m.sender} · {new Date(m.receivedAt).toLocaleString("en-IN")}</p><p className="mt-2 text-sm text-muted">{m.preview??"No preview available"}</p></div>
      <button type="button" disabled={!q.data?.mutationsEnabled||create.isPending} onClick={()=>create.mutate(m.id)} className="rounded-full border border-line px-3 py-2 text-xs font-semibold disabled:opacity-50">Create case</button>
     </div>
    </article>)}
    {!q.data?.inbound.length?<p className="rounded-xl border border-line p-5 text-sm text-muted">No untriaged inbound messages.</p>:null}
   </section>
   <section className="space-y-3">
    <div><h3 className="font-display text-lg font-semibold">Case register</h3><p className="text-xs text-muted">Status, priority and internal notes are recorded with an audit event.</p></div>
    {(q.data?.cases??[]).map(c=><article key={c.id} className="rounded-xl border border-line bg-surface p-4 space-y-3">
     <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">#{c.caseNumber} · {c.subject}</p><p className="mt-1 text-xs text-muted">{c.requesterEmail} · Updated {new Date(c.updatedAt).toLocaleString("en-IN")}</p></div><span className="rounded-full border border-line px-2 py-1 text-xs">{c.priority}</span></div>
     <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-xs text-muted">Status<select value={c.status} disabled={!q.data?.mutationsEnabled||update.isPending} onChange={e=>update.mutate({caseId:c.id,status:e.target.value as typeof STATUSES[number]})} className="mt-1 h-10 w-full rounded-lg border border-line bg-elevated px-2 text-sm">{STATUSES.map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="text-xs text-muted">Priority<select value={c.priority} disabled={!q.data?.mutationsEnabled||update.isPending} onChange={e=>update.mutate({caseId:c.id,priority:e.target.value as typeof PRIORITIES[number]})} className="mt-1 h-10 w-full rounded-lg border border-line bg-elevated px-2 text-sm">{PRIORITIES.map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="text-xs text-muted">Assigned to<select value={c.assignedTo??""} disabled={!q.data?.mutationsEnabled||update.isPending} onChange={e=>update.mutate({caseId:c.id,assignedTo:e.target.value||null})} className="mt-1 h-10 w-full rounded-lg border border-line bg-elevated px-2 text-sm"><option value="">Unassigned</option>{(q.data?.staff??[]).map(person=><option key={person.userId} value={person.userId}>{person.displayName} · {person.role.replaceAll("_"," ")}</option>)}</select></label>
     </div>
     <div className="flex flex-col gap-2 sm:flex-row"><input value={note[c.id]??""} onChange={e=>setNote(v=>({...v,[c.id]:e.target.value}))} maxLength={4000} placeholder="Internal-only note" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-elevated px-3 text-sm"/><button type="button" disabled={!q.data?.mutationsEnabled||!note[c.id]?.trim()||update.isPending} onClick={()=>update.mutate({caseId:c.id,internalNote:note[c.id]}, {onSuccess:()=>setNote(v=>({...v,[c.id]:""}))})} className="rounded-full border border-line px-4 py-2 text-xs font-semibold disabled:opacity-50">Add note</button></div>
    </article>)}
    {!q.data?.cases.length?<p className="rounded-xl border border-line p-5 text-sm text-muted">No support cases have been created.</p>:null}
   </section>
  </>}
  {create.isError||update.isError?<p role="alert" className="text-sm text-accent">{(create.error??update.error) instanceof Error?(create.error??update.error)?.message:"Support action failed"}</p>:null}
  <section className="rounded-xl border border-line p-4 text-xs text-muted">Outbound email: DISABLED. No customer replies, attachments, or external invitations are sent from this workspace. Case writes are feature-gated; case events and changes are server-side audited.</section>
 </div>;
}
