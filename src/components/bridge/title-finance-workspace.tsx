import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveFinanceReconciliation,
  approveInvestmentAgreement,
  approveLicensingAllocation,
  createFinanceReconciliation,
  createLicensingAllocations,
  getOwnTitleFinancialStatements,
  getTitleFinanceControlCentre,
  markLicensingAllocationPaid,
  recordLicensingReceipt,
  submitInvestmentAgreement,
  submitTitleOwnerInterests,
  verifyLicensingReceipt,
  verifyTitleOwnerInterests,
} from "@/lib/bridge/title-finance";

type Props = { actor: { userId: string; accountType: string; internalRole: string | null } };
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const inputClass = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg";
const buttonClass = "rounded-full border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50";

export function TitleFinanceWorkspace({ actor }: Props) {
  const qc = useQueryClient();
  const isSuperAdmin = actor.internalRole === "super_admin";
  const ownQuery = useQuery({ queryKey: ["title-finance-own", actor.userId], queryFn: () => getOwnTitleFinancialStatements(), enabled: !actor.internalRole && ["independent_creator", "studio"].includes(actor.accountType) });
  const financeQuery = useQuery({ queryKey: ["title-finance-control-centre"], queryFn: () => getTitleFinanceControlCentre(), enabled: isSuperAdmin });
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState({ titleId: "", rightsGrantId: "", buyerUserId: "", contractReference: "", paymentReference: "", gross: "", tax: "0", deductions: "0", evidenceUrl: "" });
  const [ownerJson, setOwnerJson] = useState('[{"ownerUserId":"","ownerAccountType":"independent_creator","ownerOrganizationId":null,"shareBps":10000,"agreementReference":"","evidenceUrl":"https://"}]');
  const [ownerVerifyIds, setOwnerVerifyIds] = useState("");
  const [investorJson, setInvestorJson] = useState('{"titleId":"","investorUserId":"","agreementReference":"","returnModel":"REVENUE_SHARE","shareBps":10000,"capAmountPaise":null,"evidenceUrl":"https://","effectiveFrom":"2026-11-23T00:00:00.000Z","effectiveTo":null}');
  const [allocationJson, setAllocationJson] = useState('[{"beneficiaryType":"OWNER","beneficiaryUserId":"","ownerInterestId":"","amountPaise":0}]');
  const [reconciliation, setReconciliation] = useState({ periodStart: "", periodEnd: "", notes: "" });
  const [payoutEvidence, setPayoutEvidence] = useState<Record<string, { reference: string; url: string }>>({});
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["title-finance-own"] }); await qc.invalidateQueries({ queryKey: ["title-finance-control-centre"] }); };
  const run = (fn: () => Promise<unknown>) => async () => { try { const result = await fn(); setNotice("Saved successfully. Refreshing verified finance records."); await refresh(); return result; } catch (e) { setNotice(e instanceof Error ? e.message : "Action failed."); } };
  const recordReceipt = useMutation({ mutationFn: () => recordLicensingReceipt({ data: { titleId: receipt.titleId, rightsGrantId: receipt.rightsGrantId, buyerUserId: receipt.buyerUserId || null, contractReference: receipt.contractReference, paymentReference: receipt.paymentReference, grossAmountPaise: Math.round(Number(receipt.gross) * 100), taxAmountPaise: Math.round(Number(receipt.tax) * 100), deductionAmountPaise: Math.round(Number(receipt.deductions) * 100), evidenceUrl: receipt.evidenceUrl } }), onSuccess: async () => { setNotice("Receipt recorded as PENDING. Super Admin verification is still required."); await refresh(); }, onError: (e) => setNotice(e instanceof Error ? e.message : "Receipt could not be recorded.") });
  const submitOwners = useMutation({ mutationFn: async () => { const interests = JSON.parse(ownerJson); return submitTitleOwnerInterests({ data: { titleId: interests[0]?.titleId ?? receipt.titleId, interests } }); }, onSuccess: async () => { setNotice("Owner interests submitted for verification."); await refresh(); }, onError: (e) => setNotice(e instanceof Error ? e.message : "Owner interests could not be submitted.") });
  const verifyOwners = useMutation({ mutationFn: () => verifyTitleOwnerInterests({ data: { titleId: receipt.titleId, interestIds: ownerVerifyIds.split(",").map((x) => x.trim()).filter(Boolean) } }), onSuccess: async () => { setNotice("Ownership interests verified."); await refresh(); }, onError: (e) => setNotice(e instanceof Error ? e.message : "Ownership verification failed.") });
  const submitInvestor = useMutation({ mutationFn: () => submitInvestmentAgreement({ data: JSON.parse(investorJson) }), onSuccess: async () => { setNotice("Investment agreement submitted for approval."); await refresh(); }, onError: (e) => setNotice(e instanceof Error ? e.message : "Investment agreement could not be submitted.") });
  const createAllocations = useMutation({ mutationFn: () => { const parsed = JSON.parse(allocationJson); return createLicensingAllocations({ data: { receiptId: parsed.receiptId, allocations: parsed.allocations } }); }, onSuccess: async () => { setNotice("Allocations created in PENDING_APPROVAL state."); await refresh(); }, onError: (e) => setNotice(e instanceof Error ? e.message : "Allocations could not be created.") });
  const createRecon = useMutation({ mutationFn: () => createFinanceReconciliation({ data: reconciliation }), onSuccess: async () => { setNotice("Reconciliation snapshot created. Any variance must be resolved before approval."); await refresh(); }, onError: (e) => setNotice(e instanceof Error ? e.message : "Reconciliation could not be created.") });
  const isBusy = recordReceipt.isPending || submitOwners.isPending || verifyOwners.isPending || submitInvestor.isPending || createAllocations.isPending || createRecon.isPending;

  if (!isSuperAdmin) {
    const statements = ownQuery.data?.statements ?? [];
    return <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Verified licensing revenue only</p>
      <h3 className="mt-1 text-xl font-semibold">Title earnings & statements</h3>
      <p className="mt-2 text-sm text-muted">Service fees are excluded. Amounts below are sourced only from title-specific licensing allocations. Pending, approved and paid balances are shown separately.</p>
      {ownQuery.isPending ? <p className="mt-4 text-sm text-muted">Loading title statements…</p> : null}
      {ownQuery.isError ? <p role="alert" className="mt-4 text-sm text-danger">Statements are unavailable. No estimated balance is displayed.</p> : null}
      {!ownQuery.isPending && !ownQuery.isError && !statements.length ? <p className="mt-4 rounded-lg bg-subtle p-3 text-sm text-muted">No licensing allocations are recorded for your authorized titles yet.</p> : null}
      <div className="mt-4 grid gap-3">{statements.map((item) => <article key={item.titleId} className="rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-semibold">{item.titleName}</h4><p className="text-xs text-muted">{item.titleStatus} · {item.titleId}</p></div><span className="text-xs text-muted">Verified title ledger</span></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-muted">Pending / hold</p><p className="font-semibold tabular-nums">{money(item.pendingPaise)}</p></div><div><p className="text-xs text-muted">Approved</p><p className="font-semibold tabular-nums">{money(item.approvedPaise)}</p></div><div><p className="text-xs text-muted">Paid</p><p className="font-semibold tabular-nums">{money(item.paidPaise)}</p></div></div>
      </article>)}</div>
    </section>;
  }

  const data = financeQuery.data;
  return <section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Super Admin · Founder Centre</p><h3 className="mt-1 text-xl font-semibold">Licensing revenue & settlement control</h3><p className="mt-2 text-sm text-muted">This ledger is separate from service orders and service fees. Receipt verification, ownership evidence, investor agreements, allocations and payouts require explicit Super Admin actions.</p></div>
    {notice ? <p role="status" className="rounded-lg bg-subtle p-3 text-sm">{notice}</p> : null}
    {financeQuery.isPending ? <p className="text-sm text-muted">Loading finance records…</p> : null}
    {financeQuery.isError ? <p role="alert" className="text-sm text-danger">Finance records unavailable. Do not create financial decisions from incomplete data.</p> : null}
    {data ? <>
      <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-subtle p-3"><p className="text-xs text-muted">Receipts</p><p className="text-xl font-semibold">{data.receipts.length}</p></div><div className="rounded-lg bg-subtle p-3"><p className="text-xs text-muted">Pending verification</p><p className="text-xl font-semibold">{data.receipts.filter((x: any) => x.verification_status === "PENDING").length}</p></div><div className="rounded-lg bg-subtle p-3"><p className="text-xs text-muted">Pending allocations</p><p className="text-xl font-semibold">{data.allocations.filter((x: any) => x.status === "PENDING_APPROVAL").length}</p></div></div>
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-semibold">Record licensing receipt</summary>
        <p className="mt-2 text-xs text-muted">Only for a title in LICENSED / DELIVERED status with a currently valid rights grant. Receipt remains PENDING until reviewed and verified.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{(["titleId","rightsGrantId","buyerUserId","contractReference","paymentReference","gross","tax","deductions","evidenceUrl"] as const).map((key) => <label key={key} className="text-xs text-muted">{key}<input className={inputClass} value={receipt[key]} onChange={(e) => setReceipt((old) => ({ ...old, [key]: e.target.value }))} placeholder={key === "evidenceUrl" ? "https://" : key} /></label>)}</div>
        <button className={buttonClass+" mt-3"} disabled={isBusy || !receipt.titleId || !receipt.rightsGrantId || !receipt.contractReference || !receipt.paymentReference || !(Number(receipt.gross)>0) || !receipt.evidenceUrl.startsWith("https://")} onClick={() => recordReceipt.mutate()}>Record pending receipt</button>
      </details>
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-semibold">Submit title ownership interests</summary>
        <p className="mt-2 text-xs text-muted">JSON array. Each entry must identify a real Creator / Studio profile, its share in basis points, signed agreement reference and HTTPS evidence. Total must equal 10000 bps.</p>
        <textarea className={inputClass+" mt-2 min-h-28 font-mono"} value={ownerJson} onChange={(e) => setOwnerJson(e.target.value)} />
        <button className={buttonClass+" mt-2"} disabled={isBusy} onClick={() => submitOwners.mutate()}>Submit owner interests</button>
        <label className="mt-3 block text-xs text-muted">Title ID<input className={inputClass} value={receipt.titleId} onChange={(e) => setReceipt((old) => ({ ...old, titleId: e.target.value }))} /></label>
        <label className="mt-2 block text-xs text-muted">Pending owner-interest IDs (comma separated)<input className={inputClass} value={ownerVerifyIds} onChange={(e) => setOwnerVerifyIds(e.target.value)} /></label>
        <button className={buttonClass+" mt-2"} disabled={isBusy || !receipt.titleId || !ownerVerifyIds.trim()} onClick={() => verifyOwners.mutate()}>Verify complete ownership set</button>
      </details>
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-semibold">Submit investor agreement</summary>
        <p className="mt-2 text-xs text-muted">Agreement is not active until Super Admin approval. Revenue share and fixed-cap terms are explicit; no assumed ROI.</p>
        <textarea className={inputClass+" mt-2 min-h-28 font-mono"} value={investorJson} onChange={(e) => setInvestorJson(e.target.value)} />
        <button className={buttonClass+" mt-2"} disabled={isBusy} onClick={() => submitInvestor.mutate()}>Submit investor agreement</button>
      </details>
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-semibold">Create licensing allocations</summary>
        <p className="mt-2 text-xs text-muted">JSON object with receiptId and allocations array. Only verified owner interests, approved investor agreements and Bridge residual allocation are accepted. Total cannot exceed verified net receipt.</p>
        <textarea className={inputClass+" mt-2 min-h-28 font-mono"} value={allocationJson} onChange={(e) => setAllocationJson(e.target.value)} />
        <button className={buttonClass+" mt-2"} disabled={isBusy} onClick={() => createAllocations.mutate()}>Create pending allocations</button>
      </details>
      <div className="space-y-2"><h4 className="font-semibold">Receipt verification queue</h4>{data.receipts.map((r: any) => <article key={r.id} className="rounded-lg border border-line p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{r.title_name}</strong><span>{r.verification_status}</span></div><p className="text-xs text-muted">{r.contract_reference} · {r.payment_reference}</p><p className="mt-1 tabular-nums">Net: {money(Number(r.net_amount_paise))}</p>{r.verification_status === "PENDING" ? <button className={buttonClass+" mt-2"} disabled={isBusy} onClick={run(() => verifyLicensingReceipt({ data: { receiptId: r.id, verificationNote: "Super Admin reviewed the linked payment evidence." } }))}>Verify receipt</button> : null}</article>)}</div>
      <div className="space-y-2"><h4 className="font-semibold">Ownership & investment agreements</h4>{data.owners.map((o: any) => <p key={o.id} className="rounded-lg border border-line p-2 text-sm">{o.title_name} · {o.owner_user_id} · {(Number(o.share_bps)/100).toFixed(2)}% · {o.status}</p>)}{data.investors.map((i: any) => <article key={i.id} className="rounded-lg border border-line p-2 text-sm"><p>{i.title_name} · {i.investor_user_id} · {i.return_model} · {(Number(i.share_bps)/100).toFixed(2)}% · {i.status}</p>{i.status === "PENDING_APPROVAL" ? <button className={buttonClass+" mt-2"} onClick={run(() => approveInvestmentAgreement({ data: { agreementId: i.id } }))}>Approve agreement</button> : null}</article>)}</div>
      <div className="space-y-2"><h4 className="font-semibold">Licensing allocations</h4>{data.allocations.map((a: any) => <article key={a.id} className="rounded-lg border border-line p-3 text-sm"><p className="font-semibold">{a.title_name} · {a.beneficiary_type} · {money(Number(a.amount_paise))}</p><p className="text-xs text-muted">{a.beneficiary_user_id ?? "Bridge"} · {a.status}</p>{a.status === "PENDING_APPROVAL" ? <button className={buttonClass+" mt-2"} onClick={run(() => approveLicensingAllocation({ data: { allocationId: a.id } }))}>Approve allocation</button> : null}{a.status === "APPROVED" ? <div className="mt-2 grid gap-2 sm:grid-cols-2"><input className={inputClass} placeholder="Payout reference" value={payoutEvidence[a.id]?.reference ?? ""} onChange={(e) => setPayoutEvidence((old) => ({ ...old, [a.id]: { reference: e.target.value, url: old[a.id]?.url ?? "" } }))} /><input className={inputClass} placeholder="HTTPS payout evidence URL" value={payoutEvidence[a.id]?.url ?? ""} onChange={(e) => setPayoutEvidence((old) => ({ ...old, [a.id]: { reference: old[a.id]?.reference ?? "", url: e.target.value } }))} /><button className={buttonClass+" sm:col-span-2"} disabled={!payoutEvidence[a.id]?.reference || !payoutEvidence[a.id]?.url?.startsWith("https://")} onClick={run(() => markLicensingAllocationPaid({ data: { allocationId: a.id, settlementReference: payoutEvidence[a.id].reference, settlementEvidenceUrl: payoutEvidence[a.id].url } }))}>Record verified payout</button></div> : null}</article>)}</div>
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-semibold">Period reconciliation</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs text-muted">Period start<input className={inputClass} type="date" value={reconciliation.periodStart} onChange={(e) => setReconciliation((old) => ({ ...old, periodStart: e.target.value }))} /></label><label className="text-xs text-muted">Period end<input className={inputClass} type="date" value={reconciliation.periodEnd} onChange={(e) => setReconciliation((old) => ({ ...old, periodEnd: e.target.value }))} /></label></div><textarea className={inputClass+" mt-2"} placeholder="Reconciliation notes" value={reconciliation.notes} onChange={(e) => setReconciliation((old) => ({ ...old, notes: e.target.value }))} /><button className={buttonClass+" mt-2"} disabled={isBusy || !reconciliation.periodStart || !reconciliation.periodEnd} onClick={() => createRecon.mutate()}>Create reconciliation snapshot</button></details>
      <div className="space-y-2"><h4 className="font-semibold">Reconciliation history</h4>{data.reconciliations.map((r: any) => <article key={r.id} className="rounded-lg border border-line p-3 text-sm"><p className="font-semibold">{r.reconciliation_number} · {r.status}</p><p className="text-xs text-muted">{r.period_start} — {r.period_end}</p><p className="mt-1 tabular-nums">Receipts {money(Number(r.verified_receipts_paise))} · Allocated {money(Number(r.allocated_paise))} · Variance {money(Number(r.variance_paise))}</p>{r.status !== "APPROVED" && Number(r.variance_paise) === 0 ? <button className={buttonClass+" mt-2"} onClick={run(() => approveFinanceReconciliation({ data: { reconciliationId: r.id } }))}>Approve zero-variance reconciliation</button> : null}</article>)}</div>
    </> : null}
  </section>;
}
