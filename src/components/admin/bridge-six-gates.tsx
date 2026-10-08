import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { listAdminWorkstations } from "@/lib/bridge/admin-workstations";
import { reviewTitleWorkflow, submitLoopLicense } from "@/lib/bridge/workflow";
import { authorizeLoopPublication } from "@/lib/bridge/loop-publication";
import type { TitleStatus } from "@/lib/bridge/types";

type GateKey = "QC" | "LEGAL" | "RIGHTS" | "COMMERCIAL" | "OTT" | "PACKAGING" | "CURATION" | "DELIVERY";
const STATUS: Record<string, string> = {
  PREPARING:"PREPARING", QC_REVIEW:"QC REVIEW", RIGHTS_REVIEW:"RIGHTS REVIEW",
  LICENSING_READY:"LICENSING READY", LIVE_FOR_BUYERS:"LIVE FOR BUYERS",
  IN_NEGOTIATION:"IN NEGOTIATION", LICENSED:"LICENSED", DELIVERED:"DELIVERED",
};

const inputClass = "mt-1 h-10 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm";
const textAreaClass = "mt-1 w-full rounded-xl border border-line-strong bg-elevated px-3 py-2 text-sm";

export function BridgeSixGates() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey:["bridge-six-gates"], queryFn: () => listAdminWorkstations() });
  const [selectedId, setSelectedId] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const title = useMemo(() => (query.data?.titles ?? []).find((t:any) => t.id === selectedId) ?? null, [query.data, selectedId]);

  const refresh = () => qc.invalidateQueries({queryKey:["bridge-six-gates"]});

  if (query.isPending) return <div className="rounded-3xl border border-line bg-surface p-6 text-sm text-muted">Loading release gates…</div>;
  if (query.isError || !query.data) return <div className="rounded-3xl border border-line bg-surface p-6 text-sm">Unable to load the Bridge release gates.</div>;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bridge Release Control</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Six-Gate Review Desk</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Operator UI for the canonical QC → Legal/Rights → Commercial → Publication pipeline. All writes use existing verified server workflows; there are no mock API calls.
        </p>
        <label className="mt-6 block max-w-xl text-sm font-medium">
          Title
          <select className={inputClass} value={selectedId} onChange={(e)=>{setSelectedId(e.target.value);setMessage(null);}}>
            <option value="">Select a title…</option>
            {query.data.titles.map((t:any)=><option key={t.id} value={t.id}>{t.name} · {STATUS[t.status] ?? t.status}</option>)}
          </select>
        </label>
      </header>

      {title ? <GateWorkspace title={title} onRefresh={refresh} onMessage={setMessage} /> : null}
      {message ? <p role="status" className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">{message}</p> : null}
    </section>
  );
}

function GateWorkspace({ title, onRefresh, onMessage }: { title:any; onRefresh:()=>void; onMessage:(m:string)=>void }) {
  const [draft, setDraft] = useState({
    note:"",
    territories:"WORLDWIDE",
    languages:title.language || "Malayalam",
    windowStart:new Date().toISOString(),
    windowEnd:"",
    exclusivity:"NON_EXCLUSIVE" as "EXCLUSIVE"|"NON_EXCLUSIVE",
    agreementReference:"",
    ownershipReference:"",
    rightsOwnerSharePct:"80",
    distributorSharePct:"20",
    feeInr:String(Math.max(1, Math.round((title.licensing_fee_paise ?? 0) / 100))),
    accessTier:"TVOD" as "FREE"|"SVOD"|"TVOD",
  });

  const review = useMutation({ mutationFn: reviewTitleWorkflow, onSuccess:(r)=>{onMessage(`Workflow advanced to ${String((r as any).status).replaceAll("_"," ")}.`);onRefresh();} });
  const saveRights = useMutation({ mutationFn: submitLoopLicense, onSuccess:()=>{onMessage("Rights draft saved. A different legal reviewer must approve it.");onRefresh();} });
  const publish = useMutation({ mutationFn: authorizeLoopPublication, onSuccess:(r)=>{onMessage(`Loop authorization completed: ${String((r as any).status)}.`);onRefresh();} });

  const qcReady = title.status === "QC_REVIEW";
  const legalReady = title.status === "RIGHTS_REVIEW";

  function parts(s:string){return s.split(",").map(v=>v.trim()).filter(Boolean);}
  const feePaise = Math.max(0, Math.round(Number(draft.feeInr || 0) * 100));
  const commercialOk = feePaise > 0 && Number(draft.rightsOwnerSharePct) + Number(draft.distributorSharePct) === 100;

  return <div className="grid gap-4 xl:grid-cols-2">
    <GateCard number="01" title="Technical QC" status={qcReady ? "READY" : title.status === "RIGHTS_REVIEW" || title.status === "LICENSING_READY" || title.status === "LIVE_FOR_BUYERS" || title.status === "IN_NEGOTIATION" || title.status === "LICENSED" || title.status === "DELIVERED" ? "CLEARED" : "LOCKED"} description="Approve only the current verified master and poster.">
      {qcReady ? <ActionReview onClick={()=>review.mutate({data:{titleId:title.id,stage:"QC",decision:"APPROVE",note:draft.note || "Technical QC completed"}})} pending={review.isPending} label="PASS QC → RIGHTS" /> : null}
      <label className="block text-sm">Reviewer note<textarea maxLength={2000} value={draft.note} onChange={e=>setDraft(v=>({...v,note:e.target.value}))} className={textAreaClass} rows={3}/></label>
    </GateCard>

    <GateCard number="02" title="Legal Clearance" status={legalReady ? "READY" : title.status === "LICENSING_READY" || title.status === "LIVE_FOR_BUYERS" || title.status === "IN_NEGOTIATION" || title.status === "LICENSED" || title.status === "DELIVERED" ? "CLEARED" : "LOCKED"} description="Approve a persisted rights draft; self-approval is rejected server-side.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Agreement reference" value={draft.agreementReference} onChange={v=>setDraft(x=>({...x,agreementReference:v}))} placeholder="Agreement / contract reference" />
        <Field label="Ownership reference" value={draft.ownershipReference} onChange={v=>setDraft(x=>({...x,ownershipReference:v}))} placeholder="Ownership evidence reference" />
      </div>
      <label className="block text-sm">Legal note<textarea maxLength={2000} value={draft.note} onChange={e=>setDraft(v=>({...v,note:e.target.value}))} className={textAreaClass} rows={3}/></label>
      {legalReady ? <ActionReview onClick={()=>{/* legal approval requires an existing DRAFT grant id; the rights step below creates it */ onMessage("Create the rights draft below, then approve it from the Rights step using the server workflow.")}} pending={false} label="LEGAL REVIEW ACTIVE" /> : null}
    </GateCard>

    <GateCard number="03" title="Rights Grant" status={title.status === "LICENSING_READY" || title.status === "LIVE_FOR_BUYERS" || title.status === "IN_NEGOTIATION" || title.status === "LICENSED" || title.status === "DELIVERED" ? "CLEARED" : "ACTION"} description="Create a DRAFT rights grant with scoped territory, language, window and commercial split.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Territories" value={draft.territories} onChange={v=>setDraft(x=>({...x,territories:v}))} />
        <Field label="Languages" value={draft.languages} onChange={v=>setDraft(x=>({...x,languages:v}))} />
        <Field label="Window start (ISO)" value={draft.windowStart} onChange={v=>setDraft(x=>({...x,windowStart:v}))} />
        <Field label="Window end (ISO)" value={draft.windowEnd} onChange={v=>setDraft(x=>({...x,windowEnd:v}))} />
        <Field label="Agreement reference" value={draft.agreementReference} onChange={v=>setDraft(x=>({...x,agreementReference:v}))} />
        <Field label="Ownership reference" value={draft.ownershipReference} onChange={v=>setDraft(x=>({...x,ownershipReference:v}))} />
      </div>
      <select className={inputClass} value={draft.exclusivity} onChange={e=>setDraft(x=>({...x,exclusivity:e.target.value as any}))}><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select>
      <Button disabled={saveRights.isPending || !draft.windowEnd || !draft.agreementReference || !draft.ownershipReference} onClick={()=>saveRights.mutate({data:{
        titleId:title.id, territories:parts(draft.territories), languages:parts(draft.languages), windowStart:draft.windowStart, windowEnd:draft.windowEnd,
        exclusivity:draft.exclusivity, agreementReference:draft.agreementReference, ownershipReference:draft.ownershipReference,
        rightsOwnerSharePct:Number(draft.rightsOwnerSharePct), distributorSharePct:Number(draft.distributorSharePct)
      }})}>{saveRights.isPending ? "Saving…" : "Save rights draft"}</Button>
    </GateCard>

    <GateCard number="04" title="Commercial Terms" status={commercialOk ? "READY" : "ACTION"} description="Set a positive licensing fee and 100% ownership/distributor split before publication.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fee (INR)" value={draft.feeInr} onChange={v=>setDraft(x=>({...x,feeInr:v}))} type="number" />
        <Field label="Rights owner %" value={draft.rightsOwnerSharePct} onChange={v=>setDraft(x=>({...x,rightsOwnerSharePct:v}))} type="number" />
        <Field label="Distributor %" value={draft.distributorSharePct} onChange={v=>setDraft(x=>({...x,distributorSharePct:v}))} type="number" />
      </div>
      <p className="text-xs text-muted">{commercialOk ? "Commercial terms are valid." : "Fee must be > ₹0 and shares must total 100%."}</p>
    </GateCard>

    <GateCard number="05" title="Buyer Publication" status={title.status === "LIVE_FOR_BUYERS" ? "CLEARED" : title.status === "LICENSING_READY" ? "NEXT" : "LOCKED"} description="Buyer visibility remains fail-closed until the canonical publication gates pass.">
      <p className="text-sm text-muted">Set all required buyer readiness gates from the existing Admin buyer-release controls; the server verifies them before publication.</p>
      <Button variant="outline" onClick={()=>onMessage("Use the Buyer release tab in Admin Workstations for OTT, packaging, curation and delivery readiness. Publication never forces LIVE_FOR_BUYERS directly.")}>Open buyer-release controls</Button>
    </GateCard>

    <GateCard number="06" title="Loop Authorization" status={title.status === "LIVE_FOR_BUYERS" || title.status === "IN_NEGOTIATION" || title.status === "LICENSED" || title.status === "DELIVERED" ? "NEXT" : "LOCKED"} description="Authorize Crayons Loop only after preflight verifies rights, QC, legal evidence, assets and commercial terms.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Territories" value={draft.territories} onChange={v=>setDraft(x=>({...x,territories:v}))} />
        <Field label="Languages" value={draft.languages} onChange={v=>setDraft(x=>({...x,languages:v}))} />
        <Field label="Window start" value={draft.windowStart} onChange={v=>setDraft(x=>({...x,windowStart:v}))} />
        <Field label="Window end" value={draft.windowEnd} onChange={v=>setDraft(x=>({...x,windowEnd:v}))} />
      </div>
      <Button disabled={publish.isPending || title.status === "PREPARING" || !draft.windowEnd || !commercialOk} onClick={()=>publish.mutate({data:{
        bridgeTitleId:title.id,destination:"CRAYONS_LOOP",territories:["WORLDWIDE"],languages:parts(draft.languages),
        exploitationModels:["TVOD"],windowStart:draft.windowStart,windowEnd:draft.windowEnd,accessTier:"TVOD",
        commercialTerms:{rightsOwnerSharePct:Number(draft.rightsOwnerSharePct),distributorSharePct:Number(draft.distributorSharePct),feePaise}
      }})}>{publish.isPending ? "Authorizing…" : "Run Loop preflight + authorize"}</Button>
    </GateCard>
  </div>;
}

function GateCard({number,title,status,description,children}:{number:string;title:string;status:string;description:string;children:React.ReactNode}) {
  return <article className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{number}</p><h3 className="mt-1 font-display text-xl font-semibold">{title}</h3></div><span className="rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">{status}</span></div>
    <p className="mt-2 text-sm text-muted">{description}</p>
    <div className="mt-4 space-y-3">{children}</div>
  </article>;
}
function Field({label,value,onChange,placeholder,type="text"}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;type?:string}) {
  return <label className="block text-sm"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)} className={inputClass}/></label>;
}
function ActionReview({onClick,pending,label}:{onClick:()=>void;pending:boolean;label:string}) {
  return <Button disabled={pending} onClick={onClick}>{pending ? "Submitting…" : label}</Button>;
}
