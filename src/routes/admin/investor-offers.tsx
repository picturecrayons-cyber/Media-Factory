import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { createInvestmentOfferDraft, listAdminInvestmentOffers, transitionInvestmentOffer } from "@/lib/bridge/investment-offers";

export const Route = createFileRoute("/admin/investor-offers")({ component: InvestmentOffersAdmin });

const split = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
const money = (paise: unknown) => "₹" + (Number(paise ?? 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function InvestmentOffersAdmin() {
  return <RequireBridge allow="internal">{(actor) => {
    if (!["admin", "super_admin", "legal_reviewer"].includes(actor.internalRole ?? "")) {
      return <BridgeShell actor={actor} title="Title investment offers"><p className="rounded-xl border border-line p-6">Admin or legal-review access is required.</p></BridgeShell>;
    }
    return <BridgeShell actor={actor} title="Title investment offers"><OfferAdminBody role={actor.internalRole ?? ""} /></BridgeShell>;
  }}</RequireBridge>;
}

function OfferAdminBody({ role }: { role: string }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["bridge-investment-offers-admin"], queryFn: () => listAdminInvestmentOffers() });
  const [titleId, setTitleId] = useState("");
  const [min, setMin] = useState("100000");
  const [target, setTarget] = useState("500000");
  const [max, setMax] = useState("1000000");
  const [basis, setBasis] = useState<"NET_DISTRIBUTION_RECEIPTS" | "GROSS_DISTRIBUTION_RECEIPTS" | "FIXED_ECONOMIC_SHARE">("NET_DISTRIBUTION_RECEIPTS");
  const [participation, setParticipation] = useState("10");
  const [tenure, setTenure] = useState("36");
  const [included, setIncluded] = useState("Bridge master distribution economics, as specifically defined in executed terms");
  const [excluded, setExcluded] = useState("Copyright ownership, theatrical rights, satellite rights, music rights, remake rights, dubbing rights unless expressly granted");
  const [territories, setTerritories] = useState("India");
  const [languages, setLanguages] = useState("Malayalam");
  const [media, setMedia] = useState("Digital distribution");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [terms, setTerms] = useState("Draft commercial summary only. No return is promised. Final terms, risk disclosures, eligibility and legal documents must be approved before publication.");
  const create = useMutation({
    mutationFn: () => createInvestmentOfferDraft({
      titleId,
      minimumAmountPaise: Math.round(Number(min) * 100),
      targetAmountPaise: Math.round(Number(target) * 100),
      maximumAmountPaise: Math.round(Number(max) * 100),
      participationBasis: basis,
      participationPercent: participation.trim() ? Number(participation) : null,
      tenureMonths: Number(tenure),
      rightsIncluded: split(included),
      rightsExcluded: split(excluded),
      territories: split(territories),
      languages: split(languages),
      media: split(media),
      windowStart: windowStart || null,
      windowEnd: windowEnd || null,
      termsSummary: terms,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bridge-investment-offers-admin"] }); setTitleId(""); },
  });
  const transition = useMutation({
    mutationFn: (input: { offerId: string; decision: "SUBMIT_FOR_REVIEW" | "APPROVE_LEGAL" | "RETURN_FOR_CHANGES" | "PUBLISH" | "PAUSE"; reviewReference?: string; notes?: string }) => transitionInvestmentOffer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bridge-investment-offers-admin"] }),
  });
  const offers = query.data?.offers ?? [];
  const titles = query.data?.eligibleTitles ?? [];

  return <div className="space-y-6">
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Bridge · controlled workflow</p>
      <h2 className="mt-2 font-display text-3xl font-semibold">Configure a title offer</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">Set the commercial range, participation formula, tenure and explicit rights exclusions per title. New offers are drafts only; legal/compliance approval is required before a super admin can publish. This does not collect money or promise returns.</p>
      <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <label className="text-sm">Eligible title<select required value={titleId} onChange={(e) => setTitleId(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3"><option value="">Choose a rights/QC-ready title</option>{titles.map((t: any) => <option key={t.id} value={t.id}>{t.name} · {t.status}</option>)}</select></label>
        <label className="text-sm">Participation basis<select value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3"><option value="NET_DISTRIBUTION_RECEIPTS">Net distribution receipts</option><option value="GROSS_DISTRIBUTION_RECEIPTS">Gross distribution receipts</option><option value="FIXED_ECONOMIC_SHARE">Defined economic share (legal review)</option></select></label>
        <label className="text-sm">Minimum amount (INR)<input required type="number" min="1" value={min} onChange={(e) => setMin(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Target amount (INR)<input required type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Maximum amount (INR)<input required type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Participation percentage (if applicable)<input type="number" min="0.01" max="100" step="0.01" value={participation} onChange={(e) => setParticipation(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Tenure (months)<input required type="number" min="1" max="240" value={tenure} onChange={(e) => setTenure(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Territories (comma-separated)<input required value={territories} onChange={(e) => setTerritories(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Rights languages (comma-separated)<input required value={languages} onChange={(e) => setLanguages(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Media / exploitation (comma-separated)<input required value={media} onChange={(e) => setMedia(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Rights window starts<input type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm">Rights window ends<input type="date" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm md:col-span-2">Rights included (comma-separated)<textarea required rows={2} value={included} onChange={(e) => setIncluded(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm md:col-span-2">Rights explicitly excluded (comma-separated)<textarea required rows={2} value={excluded} onChange={(e) => setExcluded(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <label className="text-sm md:col-span-2">Terms summary / cost and recoupment assumptions<textarea required minLength={20} rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={create.isPending || !titleId}>{create.isPending ? "Saving…" : "Save draft offer"}</Button>{create.isError ? <span role="alert" className="text-sm text-red-400">{String(create.error.message)}</span> : null}{create.isSuccess ? <span className="text-sm text-muted">Draft saved. No offer was published.</span> : null}</div>
      </form>
    </section>
    <section className="rounded-3xl border border-line bg-surface p-6">
      <h3 className="font-display text-2xl font-semibold">Offer approval queue</h3>
      <p className="mt-1 text-sm text-muted">Legal review requires a recorded document reference. Only super admin can publish an approved offer.</p>
      {query.isError ? <p role="alert" className="mt-4 text-sm text-red-400">Investment-offer tables are not available in this environment. Apply the migration only through the approved release process.</p> : null}
      <div className="mt-4 space-y-3">{offers.map((o: any) => <article key={o.id} className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">{o.title_name}</h4><p className="text-sm text-muted">{money(o.minimum_amount_paise)} minimum · {money(o.target_amount_paise)} target · {money(o.maximum_amount_paise)} maximum · {o.tenure_months} months</p><p className="mt-1 text-xs text-muted">Status: {o.status} · Rights included: {(o.rights_included ?? []).join(", ")} · Excluded: {(o.rights_excluded ?? []).join(", ")}</p></div><span className="rounded-full border border-line px-3 py-1 text-xs">{o.status}</span></div>
        <div className="mt-3 flex flex-wrap gap-2">
          {o.status === "DRAFT" && ["admin","super_admin"].includes(role) ? <Button variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({offerId:o.id,decision:"SUBMIT_FOR_REVIEW"})}>Submit for legal review</Button> : null}
          {o.status === "LEGAL_REVIEW" && ["legal_reviewer","admin","super_admin"].includes(role) ? <LegalActions offerId={o.id} busy={transition.isPending} onAct={(input) => transition.mutate(input)} /> : null}
          {o.status === "APPROVED" && role === "super_admin" ? <Button disabled={transition.isPending} onClick={() => transition.mutate({offerId:o.id,decision:"PUBLISH"})}>Publish approved offer</Button> : null}
          {["APPROVED","PUBLISHED"].includes(o.status) && ["admin","super_admin"].includes(role) ? <Button variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({offerId:o.id,decision:"PAUSE"})}>Pause offer</Button> : null}
        </div>
      </article>)}</div>
      {transition.isError ? <p role="alert" className="mt-3 text-sm text-red-400">{String(transition.error.message)}</p> : null}
    </section>
    <p className="text-xs leading-relaxed text-muted">Compliance guardrail: this workspace records offer terms and non-binding information requests only. It does not establish that an offer is legally compliant, solicit funds, calculate/promote returns, or integrate payment collection. Obtain qualified legal/compliance approval for the actual structure before publication.</p>
    <Link to="/admin" className="text-sm underline">← Back to Admin</Link>
  </div>;
}

function LegalActions({ offerId, busy, onAct }: { offerId: string; busy: boolean; onAct: (input: {offerId:string; decision:"APPROVE_LEGAL"|"RETURN_FOR_CHANGES"; reviewReference?:string; notes?:string})=>void }) {
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  return <div className="flex flex-wrap gap-2"><input aria-label="Legal approval document reference" placeholder="Legal approval reference" value={reference} onChange={(e)=>setReference(e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2 text-sm" /><Button disabled={busy || reference.trim().length < 3} onClick={()=>onAct({offerId,decision:"APPROVE_LEGAL",reviewReference:reference.trim(),notes})}>Record legal approval</Button><Button variant="outline" disabled={busy} onClick={()=>onAct({offerId,decision:"RETURN_FOR_CHANGES",notes})}>Return for changes</Button></div>;
}
