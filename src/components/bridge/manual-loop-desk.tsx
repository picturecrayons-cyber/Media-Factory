import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getManualLoopDelivery, prepareManualLoopDelivery, recordManualLoopDelivery, reviewManualLoopDelivery, submitManualLoopLicense } from "@/lib/bridge/loop-delivery";
import { reviewTitleWorkflow } from "@/lib/bridge/workflow";
import { authorizeLoopPublication, getLoopPublication, suspendLoopPublication, revokeLoopPublication } from "@/lib/bridge/loop-publication";
import { canOperateOnTitle, hasPermission } from "@/lib/bridge/rbac";
import type { BridgeActor } from "@/lib/bridge/session";
import type { BridgeTitle } from "@/lib/bridge/types";

export function ManualLoopDesk({ title, actor, view }: { title: BridgeTitle; actor: BridgeActor; view: "Business" | "Distribution" }) {
  const cache = useQueryClient();
  const [model, setModel] = useState<"TVOD" | "AVOD">("TVOD");
  const [languages, setLanguages] = useState(title.language);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [agreement, setAgreement] = useState("");
  const [ownership, setOwnership] = useState("");
  const [ownerShare, setOwnerShare] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [grantId, setGrantId] = useState("");
  const [handoffRef, setHandoffRef] = useState("");
  const [approvalRef, setApprovalRef] = useState("");
  const [note, setNote] = useState("");
  const [confirmedPackageId, setConfirmedPackageId] = useState<string | null>(null);
  const data = useQuery({ queryKey: ["manual-loop-delivery", title.id], queryFn: () => getManualLoopDelivery({ data: { titleId: title.id } }) });
  const publication = useQuery({ queryKey: ["loop-pub", title.id], queryFn: () => getLoopPublication({ data: { bridgeTitleId: title.id } }), enabled: Boolean(actor.internalRole) });
  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      setConfirmedPackageId(null);
      await Promise.all(["manual-loop-delivery", "title-workflow", "bridge-title", "loop-pub", "bridge-titles", "loop-publication-readiness", "bridge-audit"].map((key) => cache.invalidateQueries({ queryKey: [key] })));
    },
  });
  const button = (label: string, run: () => Promise<unknown>, disabled = false) => (
    <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50" disabled={action.isPending || disabled} onClick={() => action.mutate(run)}>{label}</button>
  );
  const input = (label: string, value: string, set: (v: string) => void, type = "text") => (
    <label className="grid gap-1 text-sm">{label}<input type={type} value={value} onChange={(e) => set(e.target.value)} className="rounded-lg border border-line bg-elevated p-2" required /></label>
  );
  const grants = data.data?.grants ?? [];
  const latest = data.data?.deliveries[0];
  const approved = grants.filter((g) => g.status === "VALID" && g.window_end && new Date(g.window_end) > new Date());
  const selected = approved.find((g) => g.id === grantId);
  const selectedModel = selected?.media.includes("AVOD") ? "AVOD" : "TVOD";
  const canDeliver = hasPermission(actor, "title.deliver");
  const canReview = hasPermission(actor, "loop.publish");
  const independent = latest && actor.userId !== latest.prepared_by && actor.userId !== latest.delivered_by;
  const pub = publication.data?.publication;

  function downloadManifest() {
    if (!latest) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ packageId: latest.id, version: latest.version, ...latest.manifest }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `bridge-loop-${title.id}-v${latest.version}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-4">
    {data.isPending ? <p>Loading manual Loop workflow…</p> : null}
    {data.isError ? <p role="alert">Manual workflow unavailable: {data.error.message}</p> : null}
    {action.isError ? <p role="alert">{action.error instanceof Error ? action.error.message : "Action failed"}</p> : null}
    <p>Loop is the buyer. QC, legal review, manual handoff, recorded Loop acceptance and publication are separate actions. Nothing here publishes automatically.</p>
    {view === "Business" ? <>
      <p>WORLDWIDE TVOD or AVOD license draft. A different legal reviewer must approve the agreement.</p>
      {canOperateOnTitle(actor, title, "title.update_own", "title.license") ? <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        action.mutate(() => submitManualLoopLicense({ data: { model, terms: {
          titleId: title.id, territories: ["WORLDWIDE"], languages: languages.split(",").map((v) => v.trim()).filter(Boolean),
          windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(),
          exclusivity: exclusive ? "EXCLUSIVE" : "NON_EXCLUSIVE", agreementReference: agreement,
          ownershipReference: ownership, rightsOwnerSharePct: Number(ownerShare), distributorSharePct: 100 - Number(ownerShare),
        } } }));
      }}>
        <label className="grid gap-1 text-sm">Commercial model<select value={model} onChange={(e) => setModel(e.target.value as "TVOD" | "AVOD")} className="rounded-lg border border-line bg-elevated p-2"><option value="TVOD">TVOD</option><option value="AVOD">AVOD · manual delivery only; publication on hold</option></select></label>
        {input("Languages", languages, setLanguages)}
        {input("Window start (your local timezone)", start, setStart, "datetime-local")}
        {input("Window end (your local timezone)", end, setEnd, "datetime-local")}
        {input("Executed agreement reference", agreement, setAgreement)}
        {input("Ownership evidence reference", ownership, setOwnership)}
        {input("Rights owner gross revenue share % (before fees/tax/refunds)", ownerShare, setOwnerShare, "number")}
        <label className="text-sm"><input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} /> Exclusive</label>
        <button disabled={action.isPending || data.isError} className="rounded-lg border border-line p-2">Save license draft</button>
      </form> : null}
      {hasPermission(actor, "title.rights_review") ? input("Legal review findings", note, setNote) : null}
      {grants.map((g) => <article key={g.id} className="space-y-2 rounded-lg border border-line p-3">
        <p>{g.status} · {g.media.filter((m) => m !== "CRAYONS_LOOP").join(", ")} · {g.territories.join(", ")} · {g.languages.join(", ")}</p>
        <p className="text-xs">{g.window_start} → {g.window_end}</p>
        <p>Agreement: {g.evidence[0]?.agreementReference ?? "Not recorded"}</p>
        {g.status === "DRAFT" && title.status === "RIGHTS_REVIEW" && hasPermission(actor, "title.rights_review") ? <div className="flex flex-wrap gap-2">
          {button("Approve rights / license", () => reviewTitleWorkflow({ data: { titleId: title.id, stage: "LEGAL", decision: "APPROVE", note, grantId: g.id } }), note.trim().length < 8)}
          {button("Reject license", () => reviewTitleWorkflow({ data: { titleId: title.id, stage: "LEGAL", decision: "REJECT", note, grantId: g.id } }), note.trim().length < 8)}
        </div> : null}
      </article>)}
      {!grants.length && data.isSuccess ? <p>No Loop license recorded. Save a draft; complete QC and legal review before handoff.</p> : null}
    </> : <>
      <p>1. Prepare a versioned package. 2. Transfer it outside the app and record the handoff. 3. A different authorized operator records Loop’s acceptance evidence. 4. Publish in a separate confirmed action.</p>
      <p>AVOD packages can be delivered and accepted, but AVOD publication remains blocked until ad-supported playback is verified. AVOD is never mapped to FREE.</p>
      {canDeliver ? <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Approved Loop license<select className="rounded-lg border border-line bg-elevated p-2" value={grantId} onChange={(e) => setGrantId(e.target.value)}>
          <option value="">Select an approved license</option>
          {approved.map((g) => <option key={g.id} value={g.id}>{g.media.filter((m) => m !== "CRAYONS_LOOP").join(", ")} · {g.languages.join(", ")} · ends {g.window_end}</option>)}
        </select></label>
        {button(latest ? "Prepare new package version" : "Prepare delivery package", () => prepareManualLoopDelivery({ data: { titleId: title.id, grantId, model: selectedModel } }), !selected || data.isError)}
      </div> : null}
      {!approved.length && data.isSuccess ? <p>Blocked: an approved, unexpired Loop license and QC for the current assets are required. Complete Prepare and Business first.</p> : null}
      {latest ? <article className="space-y-3 rounded-lg border border-line p-3">
        <p>Package v{latest.version} · {latest.model} · {latest.status}</p>
        <p>{latest.manifest.metadata.title} · {latest.manifest.metadata.language} · {latest.manifest.request.windowStart} → {latest.manifest.request.windowEnd}</p>
        <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm" onClick={downloadManifest}>Download private handoff manifest</button>
        <p className="text-sm">The manifest contains private storage references, not public playback URLs. Downloading does not transfer the media or establish buyer acceptance.</p>
        {latest.status === "PREPARED" && canDeliver ? <>
          {input("Manual transfer / handoff evidence reference", handoffRef, setHandoffRef)}
          {button("Record completed manual handoff", () => recordManualLoopDelivery({ data: { titleId: title.id, deliveryId: latest.id, reference: handoffRef } }), handoffRef.trim().length < 8)}
        </> : null}
        {latest.handoff_reference ? <p>Handoff evidence: {latest.handoff_reference}</p> : null}
        {latest.status === "DELIVERED" && canReview ? independent ? <>
          <p>Record evidence of Loop’s explicit decision. This is a manual operator attestation, not an automated buyer acknowledgement.</p>
          {input("Loop decision evidence reference", approvalRef, setApprovalRef)}
          {input("Acceptance / rejection findings", note, setNote)}
          <div className="flex flex-wrap gap-2">
            {button("Record Loop acceptance — do not publish", () => reviewManualLoopDelivery({ data: { titleId: title.id, deliveryId: latest.id, decision: "APPROVE", note, reference: approvalRef } }), note.trim().length < 8 || approvalRef.trim().length < 8)}
            {button("Record rejection", () => reviewManualLoopDelivery({ data: { titleId: title.id, deliveryId: latest.id, decision: "REJECT", note, reference: approvalRef } }), note.trim().length < 8 || approvalRef.trim().length < 8)}
          </div>
        </> : <p>Another authorized operator must record acceptance or rejection; preparers and senders cannot approve their own handoff.</p> : null}
        {latest.approval_reference ? <p>Loop decision evidence: {latest.approval_reference}. {latest.review_note}</p> : null}
        {latest.status === "APPROVED" && latest.model === "TVOD" && canReview ? <>
          <label className="block text-sm"><input type="checkbox" checked={confirmedPackageId === latest.id} onChange={(e) => setConfirmedPackageId(e.target.checked ? latest.id : null)} /> Explicitly publish this accepted TVOD package to the consumer Loop catalog</label>
          {button("Publish accepted TVOD package", () => authorizeLoopPublication({ data: { ...latest.manifest.request, bridgeTitleId: title.id, deliveryId: latest.id, accessTier: "TVOD" } }), confirmedPackageId !== latest.id)}
        </> : null}
        {latest.status === "REJECTED" ? <p>Correct the package and prepare a new version. Rejected versions cannot be published.</p> : null}
      </article> : data.isSuccess ? <p>No manual delivery recorded. The title remains unpublished by this workflow.</p> : null}
      {data.data && data.data.deliveries.length > 1 ? <p className="text-sm">Previous versions: {data.data.deliveries.slice(1).map((d) => `v${d.version} ${d.model} ${d.status}`).join(" · ")}. Only the newest version can proceed.</p> : null}
      {publication.isError ? <p role="alert">Publication unavailable: {publication.error.message}</p> : pub ? <>
        <p>Current Loop publication: {pub.authorizationStatus}. Catalog publication alone does not prove consumer playback.</p>
        {hasPermission(actor, "loop.revoke") ? <div className="flex flex-wrap gap-2">
          {button("Suspend", () => suspendLoopPublication({ data: { bridgeTitleId: title.id, reason: note || "Operator suspension" } }))}
          {button("Revoke", () => revokeLoopPublication({ data: { bridgeTitleId: title.id } }))}
        </div> : null}
        {pub.published ? <a className="text-accent underline" href={`https://crayonsloop.in/title/${title.slug}`} target="_blank" rel="noreferrer">Inspect consumer title</a> : null}
      </> : null}
    </>}
  </div>;
}
