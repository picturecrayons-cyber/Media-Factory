import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

function AdminWorkstations() {
  return <RequireBridge allow="internal">{(actor) => <BridgeShell actor={actor} title="Admin Workstations"><WorkstationBody /></BridgeShell>}</RequireBridge>;
}

function WorkstationBody() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin-workstations"], queryFn: () => listAdminWorkstations() });
  const mutation = useMutation({
    mutationFn: reviewAdminTitle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const gateMutation = useMutation({
    mutationFn: setBuyerPublicationGate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });

  const data = query.data;
  if (query.isLoading) return <div className="p-8 text-sm text-muted">Loading authoritative Bridge workstations…</div>;
  if (query.isError || !data) return <div className="rounded-2xl border border-line bg-surface p-8 text-sm">Unable to load the Bridge operational backend.</div>;
  const titleName = new Map(data.titles.map((t: any) => [t.id, t.name]));
  const submissions = data.titles.filter((t: any) => ["DRAFT","UPLOADING","PREPARING"].includes(t.status));
  const qcQueue = data.titles.filter((t: any) => t.status === "QC_REVIEW");
  const rightsQueue = data.titles.filter((t: any) => t.status === "RIGHTS_REVIEW");
  const ready = data.titles.filter((t: any) => ["LICENSING_READY","LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED"].includes(t.status));

  const ReviewRow = ({ title, actions }: { title: any; actions: Array<["ACCEPT"|"PASS"|"FAIL"|"APPROVE"|"REJECT", string]> }) => (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-elevated p-4 md:flex-row md:items-center md:justify-between">
      <div><p className="font-medium">{title.name}</p><p className="text-xs text-muted">{title.status} · {title.language} · updated {new Date(title.updated_at).toLocaleString()}</p></div>
      <div className="flex flex-wrap gap-2">{actions.map(([decision,label]) => <Button key={decision} size="sm" variant={decision==="FAIL"||decision==="REJECT" ? "outline" : undefined} disabled={mutation.isPending} onClick={() => mutation.mutate({ data: { titleId: title.id, decision } })}>{label}</Button>)}</div>
    </div>
  );


  return <div className="space-y-8">
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
            {data.titles.map((t:any) => (
              <tr key={t.id}>
                <td className="px-3 py-3 font-medium">{t.name}</td>
                <td className="px-3 py-3">{data.qc.some((q:any)=>q.title_id===t.id&&q.status==="PASSED")?"PASSED":"HOLD"}</td>
                <td className="px-3 py-3">{data.legal.some((l:any)=>l.title_id===t.id&&l.status==="APPROVED")?"APPROVED":"HOLD"}</td>
                <td className="px-3 py-3 text-xs">OTT / Packaging / Curation / Delivery are persisted certification gates.</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-2">
                  {(["OTT","PACKAGING","CURATION","DELIVERY"] as const).map((gate)=><Button key={gate} size="sm" variant="outline" disabled={gateMutation.isPending} onClick={()=>gateMutation.mutate({data:{titleId:t.id,gate,decision:"PASS"}})}>{gate} PASS</Button>)}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    <section id="loop" className="space-y-3"><h3 className="font-display text-2xl font-semibold">10 · Operational CMS / Loop Publishing</h3><p className="text-sm text-muted">{data.publications.length} persisted Bridge publication records. Authorization is server-side and requires rights, QC/master and presentation assets.</p><RecordTable rows={data.publications} titleName={titleName} fields={["authorization_status","territories","languages","exploitation_models","approved_at","revoked_at"]}/></section>
    {mutation.isError ? <p className="rounded-xl border border-line p-4 text-sm">Action failed: {String(mutation.error)}</p> : null}
  </div>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">{text}</div>; }

function RecordTable({ rows, fields, titleName }: { rows: any[]; fields: string[]; titleName: Map<any, any> }) {
  if (!rows.length) return <Empty text="No persisted records."/>;
  return <div className="overflow-x-auto rounded-2xl border border-line"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr>{fields.map(f=><th key={f} className="px-3 py-3">{f.replaceAll("_"," ")}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.slice(0,50).map((row,i)=><tr key={String(row.id ?? row.user_id ?? i)}>{fields.map(f=><td key={f} className="max-w-[320px] truncate px-3 py-3">{f==="title_id" ? (titleName.get(row[f]) ?? row[f]) : typeof row[f] === "object" ? JSON.stringify(row[f]) : String(row[f] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}