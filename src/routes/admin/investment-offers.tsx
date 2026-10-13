import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import {
  createInvestmentOfferDraft,
  listAdminInvestmentOffers,
  publishInvestmentOffer,
  reviewInvestmentOffer,
  submitInvestmentOfferForLegalReview,
} from "@/lib/bridge/investment-offers";

export const Route = createFileRoute("/admin/investment-offers")({ component: InvestmentOfferAdmin });

const emptyForm = {
  titleId: "",
  minimum: "10000",
  maximum: "1000000",
  target: "500000",
  increment: "100",
  participationBasis: "Share of defined net receipts",
  participationPercent: "10",
  participationFormula: "Calculated only against the receipts and basis stated in the signed offer terms.",
  receiptScope: "Only the title-specific rights and receipt streams explicitly listed in this offer.",
  tenureStart: "",
  tenureMonths: "24",
  maturityDate: "",
  rightsIncluded: "Master-distribution receipts explicitly evidenced for this title",
  rightsExcluded: "Copyright ownership, theatrical, satellite, music, remake, dubbing and any unlisted rights",
  permittedCosts: "Documented, pre-approved direct distribution costs",
  recoupmentPriority: "Only documented costs and the order explicitly approved in the signed terms.",
  distributionFrequency: "Quarterly, subject to reconciled receipts and signed terms",
  calculationMethod: "Actual cleared receipts minus only approved permitted costs; no forecast is a promise.",
  informationMemorandumUrl: "",
  termsDocumentUrl: "",
  riskDisclosure: "Investment involves risk, including possible partial or total loss. Returns and distributions are not guaranteed. This expression of interest is not an accepted subscription or a payment request. Offer publication does not transfer copyright or rights excluded from the written terms. Eligibility and legal/compliance approval are required before any subscription or funds are accepted.",
  rightsEvidenceReference: "",
};

function InvestmentOfferAdmin() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
          return <BridgeShell actor={actor} title="Title investment offers"><p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">Administrator access is required.</p></BridgeShell>;
        }
        return <BridgeShell actor={actor} title="Title investment offers"><InvestmentOfferAdminBody actor={actor} /></BridgeShell>;
      }}
    </RequireBridge>
  );
}

function InvestmentOfferAdminBody({ actor }: { actor: { internalRole: string | null } }) {
  const client = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), retry: false });
  const offersQ = useQuery({ queryKey: ["bridge-investment-offers-admin"], queryFn: () => listAdminInvestmentOffers(), retry: false });
  const refresh = () => client.invalidateQueries({ queryKey: ["bridge-investment-offers-admin"] });
  const createQ = useMutation({
    mutationFn: (data: Parameters<typeof createInvestmentOfferDraft>[0]["data"]) => createInvestmentOfferDraft({ data }),
    onSuccess: () => { setForm(emptyForm); void refresh(); },
  });
  const reviewQ = useMutation({
    mutationFn: (data: { offerId: string; decision: "APPROVE" | "RETURN"; note: string }) => reviewInvestmentOffer({ data }),
    onSuccess: () => void refresh(),
  });
  const publishQ = useMutation({
    mutationFn: (offerId: string) => publishInvestmentOffer({ data: { offerId } }),
    onSuccess: () => void refresh(),
  });
  const submitQ = useMutation({
    mutationFn: (offerId: string) => submitInvestmentOfferForLegalReview({ data: { offerId } }),
    onSuccess: () => void refresh(),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rupees = (value: string) => Math.round(Number(value) * 100);
    const dateOrNull = (value: string) => value.trim() || null;
    createQ.mutate({
      titleId: form.titleId,
      minimumAmountPaise: rupees(form.minimum),
      maximumAmountPaise: rupees(form.maximum),
      targetAmountPaise: rupees(form.target),
      applicationIncrementPaise: rupees(form.increment),
      participationBasis: form.participationBasis,
      participationPercent: form.participationPercent.trim() ? Number(form.participationPercent) : null,
      participationFormula: form.participationFormula,
      receiptScope: form.receiptScope,
      tenureStart: dateOrNull(form.tenureStart),
      tenureMonths: Number(form.tenureMonths),
      maturityDate: dateOrNull(form.maturityDate),
      rightsIncluded: form.rightsIncluded.split("\n").map((s) => s.trim()).filter(Boolean),
      rightsExcluded: form.rightsExcluded.split("\n").map((s) => s.trim()).filter(Boolean),
      permittedCosts: form.permittedCosts.split("\n").map((s) => s.trim()).filter(Boolean),
      recoupmentPriority: form.recoupmentPriority,
      distributionFrequency: form.distributionFrequency,
      calculationMethod: form.calculationMethod,
      informationMemorandumUrl: dateOrNull(form.informationMemorandumUrl),
      termsDocumentUrl: dateOrNull(form.termsDocumentUrl),
      riskDisclosure: form.riskDisclosure,
      rightsEvidenceReference: form.rightsEvidenceReference,
    });
  }

  const update = (key: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const titles = (titlesQ.data?.titles ?? []).filter((title) => ["LICENSING_READY", "LIVE_FOR_BUYERS"].includes(title.status));
  const offers = offersQ.data?.offers ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Admin-controlled · title by title</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Investment offer control</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Configure fixed commercial terms for a specific licensing-ready title. Investors cannot edit the offer. Legal review and independent Super Admin publication are separate steps.</p>
        <div className="mt-4 rounded-xl border border-line p-4 text-sm">
          <strong>Preview safety gate:</strong> the schema is intentionally not installed by this branch. Verify an isolated staging database and legal/compliance approval before applying the proposed migration. No payment collection is enabled.
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h3 className="font-display text-xl font-semibold">Create a title offer draft</h3>
        {titlesQ.isError ? <p role="alert" className="mt-3 text-sm text-muted">Title catalogue is unavailable. Check the Preview database binding before continuing.</p> : null}
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <Field label="Eligible title">
            <select required value={form.titleId} onChange={(e) => update("titleId", e.target.value)} className="w-full rounded-lg border border-line bg-bg p-3 text-sm">
              <option value="">Choose a licensing-ready title</option>
              {titles.map((title) => <option key={title.id} value={title.id}>{title.name} · {title.status}</option>)}
            </select>
          </Field>
          <Field label="Participation basis"><input required value={form.participationBasis} onChange={(e) => update("participationBasis", e.target.value)} className="field" /></Field>
          <Field label="Minimum amount (₹)"><input required type="number" min="1" value={form.minimum} onChange={(e) => update("minimum", e.target.value)} className="field" /></Field>
          <Field label="Maximum amount (₹)"><input required type="number" min="1" value={form.maximum} onChange={(e) => update("maximum", e.target.value)} className="field" /></Field>
          <Field label="Target raise (₹)"><input required type="number" min="1" value={form.target} onChange={(e) => update("target", e.target.value)} className="field" /></Field>
          <Field label="Application increment (₹)"><input required type="number" min="1" value={form.increment} onChange={(e) => update("increment", e.target.value)} className="field" /></Field>
          <Field label="Participation (%) — if applicable"><input type="number" min="0" max="100" step="0.0001" value={form.participationPercent} onChange={(e) => update("participationPercent", e.target.value)} className="field" /></Field>
          <Field label="Tenure (months)"><input required type="number" min="1" max="600" value={form.tenureMonths} onChange={(e) => update("tenureMonths", e.target.value)} className="field" /></Field>
          <Field label="Start date"><input type="date" value={form.tenureStart} onChange={(e) => update("tenureStart", e.target.value)} className="field" /></Field>
          <Field label="Maturity date (if applicable)"><input type="date" value={form.maturityDate} onChange={(e) => update("maturityDate", e.target.value)} className="field" /></Field>
          <Field label="Receipt scope"><textarea required value={form.receiptScope} onChange={(e) => update("receiptScope", e.target.value)} className="field min-h-24" /></Field>
          <Field label="Participation formula"><textarea required value={form.participationFormula} onChange={(e) => update("participationFormula", e.target.value)} className="field min-h-24" /></Field>
          <Field label="Rights included (one per line)"><textarea required value={form.rightsIncluded} onChange={(e) => update("rightsIncluded", e.target.value)} className="field min-h-24" /></Field>
          <Field label="Rights excluded (one per line)"><textarea required value={form.rightsExcluded} onChange={(e) => update("rightsExcluded", e.target.value)} className="field min-h-24" /></Field>
          <Field label="Permitted costs (one per line)"><textarea value={form.permittedCosts} onChange={(e) => update("permittedCosts", e.target.value)} className="field min-h-24" /></Field>
          <Field label="Recoupment priority"><textarea required value={form.recoupmentPriority} onChange={(e) => update("recoupmentPriority", e.target.value)} className="field min-h-24" /></Field>
          <Field label="Distribution frequency"><input required value={form.distributionFrequency} onChange={(e) => update("distributionFrequency", e.target.value)} className="field" /></Field>
          <Field label="Calculation method"><textarea required value={form.calculationMethod} onChange={(e) => update("calculationMethod", e.target.value)} className="field min-h-24" /></Field>
          <Field label="Information memorandum URL"><input type="url" value={form.informationMemorandumUrl} onChange={(e) => update("informationMemorandumUrl", e.target.value)} className="field" /></Field>
          <Field label="Approved terms document URL"><input type="url" value={form.termsDocumentUrl} onChange={(e) => update("termsDocumentUrl", e.target.value)} className="field" /></Field>
          <Field label="Rights evidence reference"><input required value={form.rightsEvidenceReference} onChange={(e) => update("rightsEvidenceReference", e.target.value)} className="field" /></Field>
          <Field label="Risk disclosure"><textarea required minLength={50} value={form.riskDisclosure} onChange={(e) => update("riskDisclosure", e.target.value)} className="field min-h-32" /></Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={createQ.isPending || !form.titleId}>{createQ.isPending ? "Saving draft…" : "Save offer draft"}</Button>
            {createQ.isError ? <p role="alert" className="mt-3 text-sm text-red-400">{createQ.error.message}</p> : null}
            {createQ.isSuccess ? <p className="mt-3 text-sm text-muted">Draft saved. It is not visible to investors.</p> : null}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h3 className="font-display text-xl font-semibold">Review and publication queue</h3>
        {offersQ.isError ? <p role="alert" className="mt-3 rounded-lg border border-line p-4 text-sm text-muted">Offer data is not available in this Preview yet. The proposed schema has not been applied.</p> : null}
        {reviewQ.isError || publishQ.isError || submitQ.isError ? <p role="alert" className="mt-3 text-sm text-red-400">{reviewQ.error?.message ?? publishQ.error?.message ?? submitQ.error?.message}</p> : null}
        <div className="mt-4 divide-y divide-line">
          {offers.map((offer) => (
            <article key={offer.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{offer.title_name} · v{offer.version}</p>
                <p className="mt-1 text-xs text-muted">{offer.status.replaceAll("_", " ")} · ₹{(Number(offer.minimum_amount_paise) / 100).toLocaleString("en-IN")}–₹{(Number(offer.maximum_amount_paise) / 100).toLocaleString("en-IN")} · {offer.tenure_months} months</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {offer.status === "DRAFT" ? <Button size="sm" variant="outline" disabled={submitQ.isPending} onClick={() => submitQ.mutate(offer.id)}>Submit for legal review</Button> : null}
                {offer.status === "LEGAL_REVIEW" ? <Button size="sm" variant="outline" disabled={reviewQ.isPending} onClick={() => reviewQ.mutate({ offerId: offer.id, decision: "APPROVE", note: "Reviewed in authorized Bridge workflow; verify supporting evidence and legal approval record." })}>Approve after review</Button> : null}
                {offer.status === "APPROVED" && actor.internalRole === "super_admin" ? <Button size="sm" disabled={publishQ.isPending} onClick={() => publishQ.mutate(offer.id)}>Publish offer</Button> : null}
              </div>
            </article>
          ))}
          {!offersQ.isError && !offers.length ? <p className="py-6 text-sm text-muted">No offer drafts are available in this environment.</p> : null}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">Publishing exposes the approved terms to eligible investor accounts only. Investor interest is not a subscription or payment. Real-money funding is intentionally not connected.</p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
