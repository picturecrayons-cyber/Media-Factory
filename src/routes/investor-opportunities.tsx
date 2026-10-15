import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import {
  listMyInvestmentInterests,
  listPublishedInvestmentOffers,
  submitInvestmentInterest,
} from "@/lib/bridge/investment-offers";

export const Route = createFileRoute("/investor-opportunities")({ component: InvestorOpportunities });

function InvestorOpportunities() {
  return (
    <RequireBridge allow="investor">
      {(actor) => <BridgeShell actor={actor} title="Title investment opportunities"><InvestorOpportunityBody /></BridgeShell>}
    </RequireBridge>
  );
}

function InvestorOpportunityBody() {
  const client = useQueryClient();
  const offersQ = useQuery({ queryKey: ["bridge-investment-offers-published"], queryFn: () => listPublishedInvestmentOffers(), retry: false });
  const applicationsQ = useQuery({ queryKey: ["bridge-investment-interests"], queryFn: () => listMyInvestmentInterests(), retry: false });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const interestQ = useMutation({
    mutationFn: (data: { offerId: string; requestedAmountPaise: number; acceptedTerms: true; disclosureVersion: number }) => submitInvestmentInterest({ data }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["bridge-investment-interests"] });
    },
  });
  const offers = offersQ.data?.offers ?? [];
  const applications = applicationsQ.data?.applications ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Published offers only</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Explore title-specific opportunities</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Commercial terms are set by Bridge Admin for each individual title. Review included and excluded rights, the participation formula, costs, tenure and risk disclosures before expressing interest.</p>
        <p className="mt-4 rounded-xl border border-line p-4 text-sm leading-6">An expression of interest is not an accepted investment, entitlement or payment. Returns are not guaranteed. No funds are collected from this page. Eligibility and qualified Indian legal/compliance review must be completed before any subscription process.</p>
      </section>

      {offersQ.isError ? <section role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">Published offers are not available in this Preview. The offer schema is intentionally pending isolated-staging verification.</section> : null}
      {interestQ.isError ? <p role="alert" className="text-sm text-red-400">{interestQ.error.message}</p> : null}
      <section className="grid gap-4 xl:grid-cols-2">
        {offers.map((offer) => (
          <article key={offer.id} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-widest text-accent">Version {offer.version} · published offer</p><h3 className="mt-2 font-display text-xl font-semibold">{offer.title_name}</h3></div>
              <span className="rounded-full border border-line px-3 py-1 text-xs">INR</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Minimum" value={rupees(offer.minimum_amount_paise)} />
              <Metric label="Target" value={rupees(offer.target_amount_paise)} />
              <Metric label="Maximum" value={rupees(offer.maximum_amount_paise)} />
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              <Term label="Participation basis" value={offer.participation_basis} />
              <Term label="Participation / formula" value={offer.participation_formula} />
              <Term label="Receipts covered" value={offer.receipt_scope} />
              <Term label="Tenure" value={`${offer.tenure_months} months${offer.tenure_start ? ` from ${offer.tenure_start}` : ""}${offer.maturity_date ? ` · maturity ${offer.maturity_date}` : ""}`} />
              <Term label="Rights included" value={joinItems(offer.rights_included)} />
              <Term label="Rights excluded" value={joinItems(offer.rights_excluded)} />
              <Term label="Permitted costs" value={joinItems(offer.permitted_costs)} />
              <Term label="Recoupment priority" value={offer.recoupment_priority} />
              <Term label="Distribution / calculation" value={`${offer.distribution_frequency}. ${offer.calculation_method}`} />
              <Term label="Risk disclosure" value={offer.risk_disclosure} />
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              {offer.information_memorandum_url ? <a className="text-sm font-semibold text-accent underline" href={offer.information_memorandum_url} target="_blank" rel="noreferrer">Information memorandum ↗</a> : null}
              {offer.terms_document_url ? <a className="text-sm font-semibold text-accent underline" href={offer.terms_document_url} target="_blank" rel="noreferrer">Offer terms ↗</a> : null}
            </div>
            <div className="mt-5 border-t border-line pt-5">
              <label className="block text-sm font-medium">Proposed interest amount (₹)
                <input type="number" min={Number(offer.minimum_amount_paise) / 100} max={Number(offer.maximum_amount_paise) / 100} step={Number(offer.application_increment_paise) / 100} value={amounts[offer.id] ?? String(Number(offer.minimum_amount_paise) / 100)} onChange={(e) => setAmounts((prev) => ({ ...prev, [offer.id]: e.target.value }))} className="mt-2 w-full rounded-lg border border-line bg-bg p-3" />
              </label>
              <label className="mt-3 flex items-start gap-2 text-sm leading-5 text-muted">
                <input type="checkbox" checked={!!consent[offer.id]} onChange={(e) => setConsent((prev) => ({ ...prev, [offer.id]: e.target.checked }))} className="mt-1" />
                I have reviewed this version of the terms and risk disclosure. I understand this is interest only, not a funded investment or guaranteed return.
              </label>
              <Button className="mt-4" disabled={!consent[offer.id] || interestQ.isPending} onClick={() => interestQ.mutate({ offerId: offer.id, requestedAmountPaise: Math.round(Number(amounts[offer.id] ?? Number(offer.minimum_amount_paise) / 100) * 100), acceptedTerms: true, disclosureVersion: Number(offer.version) })}>Submit expression of interest</Button>
            </div>
          </article>
        ))}
        {!offersQ.isError && !offers.length ? <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted xl:col-span-2">There are no published title offers available to this account right now.</div> : null}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h3 className="font-display text-xl font-semibold">Your expressions of interest</h3>
        {applicationsQ.isError ? <p role="alert" className="mt-3 text-sm text-muted">Your interest history is unavailable in this Preview until the staging schema is installed.</p> : null}
        <div className="mt-3 divide-y divide-line">
          {applications.map((app) => <div key={app.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{app.title_name}</p><p className="text-xs text-muted">Offer version {app.offer_version} · {new Date(app.created_at).toLocaleDateString("en-IN")}</p></div><div className="text-sm">{rupees(app.requested_amount_paise)} · <span className="text-muted">{String(app.status).replaceAll("_", " ")}</span></div></div>)}
          {!applicationsQ.isError && !applications.length ? <p className="py-4 text-sm text-muted">No expressions of interest submitted yet.</p> : null}
        </div>
      </section>
      {interestQ.isSuccess ? <p role="status" className="text-sm text-muted">Your expression of interest was recorded. This does not accept an investment or trigger a payment.</p> : null}
    </div>
  );
}

function rupees(value: string | number) {
  return `₹${(Number(value) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function joinItems(value: unknown) {
  return Array.isArray(value) ? value.map(String).join(", ") : "Not specified";
}
function Term({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap leading-6">{value}</dd></div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
