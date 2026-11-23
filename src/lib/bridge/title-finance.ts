import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertAllocationsWithinNetRevenue, assertOwnerInterestShares, ownerEntitlementPaise, investorRemainingCap } from "./title-finance-policy";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "Evidence must use HTTPS.");
const receiptInput = z.object({
  titleId: z.string().min(8),
  rightsGrantId: z.string().uuid(),
  buyerUserId: z.string().min(1).max(200).nullable().optional(),
  contractReference: z.string().min(2).max(200),
  paymentReference: z.string().min(3).max(200),
  grossAmountPaise: z.number().int().positive(),
  taxAmountPaise: z.number().int().nonnegative().default(0),
  deductionAmountPaise: z.number().int().nonnegative().default(0),
  evidenceUrl: httpsUrl,
});
const ownerInterestInput = z.object({
  titleId: z.string().min(8),
  interests: z.array(z.object({
    ownerUserId: z.string().min(1).max(200),
    ownerAccountType: z.enum(["independent_creator", "studio"]),
    ownerOrganizationId: z.string().max(200).nullable().optional(),
    shareBps: z.number().int().min(1).max(10000),
    agreementReference: z.string().min(2).max(200),
    evidenceUrl: httpsUrl,
  })).min(1).max(20),
});
const investorAgreementInput = z.object({
  titleId: z.string().min(8),
  investorUserId: z.string().min(1).max(200),
  agreementReference: z.string().min(2).max(200),
  returnModel: z.enum(["REVENUE_SHARE", "FIXED_CAP"]),
  shareBps: z.number().int().min(1).max(10000),
  capAmountPaise: z.number().int().positive().nullable().optional(),
  evidenceUrl: httpsUrl,
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable().optional(),
});
const allocationsInput = z.object({
  receiptId: z.string().uuid(),
  allocations: z.array(z.discriminatedUnion("beneficiaryType", [
    z.object({ beneficiaryType: z.literal("OWNER"), beneficiaryUserId: z.string().min(1), ownerInterestId: z.string().uuid(), amountPaise: z.number().int().positive() }),
    z.object({ beneficiaryType: z.literal("INVESTOR"), beneficiaryUserId: z.string().min(1), investmentAgreementId: z.string().uuid(), amountPaise: z.number().int().positive() }),
    z.object({ beneficiaryType: z.literal("BRIDGE"), amountPaise: z.number().int().positive() }),
  ])).min(1).max(30),
});
const reconciliationInput = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).default(""),
});

function requireSuperAdmin(actor: Awaited<ReturnType<typeof requireVerifiedActor>>, permission: "finance.read" | "finance.licensing_record" | "finance.ownership_manage" | "finance.investment_manage" | "finance.allocate" | "finance.reconcile") {
  if (actor.internalRole !== "super_admin") throw new Error("Designated Super Admin access required.");
  assertPermission(actor, permission);
}

export const getOwnTitleFinancialStatements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) throw new Error("Creator or Studio account required.");
    assertPermission(actor, "finance.read_own");
    const sql = await getSql();
    const rows = await sql.query<{
      title_id: string; title_name: string; title_status: string; owner_organization_id: string | null;
      gross_allocated_paise: number; approved_paise: number; paid_paise: number; pending_paise: number;
    }>(
      "select t.id as title_id,t.name as title_name,t.status as title_status,t.owner_organization_id,coalesce(sum(a.amount_paise) filter (where a.status in ('PENDING_APPROVAL','APPROVED','ON_HOLD','PAID')),0)::bigint as gross_allocated_paise,coalesce(sum(a.amount_paise) filter (where a.status='APPROVED'),0)::bigint as approved_paise,coalesce(sum(a.amount_paise) filter (where a.status='PAID'),0)::bigint as paid_paise,coalesce(sum(a.amount_paise) filter (where a.status in ('PENDING_APPROVAL','ON_HOLD')),0)::bigint as pending_paise from public.bridge_titles t left join public.bridge_licensing_allocations a on a.title_id=t.id and a.beneficiary_user_id=$1 and a.status<>'CANCELLED' where t.owner_user_id=$1 or ($2::text is not null and t.owner_account_type='studio' and t.owner_organization_id=$2) group by t.id,t.name,t.status,t.owner_organization_id order by t.name",
      [actor.userId, actor.accountType === "studio" ? actor.organizationId ?? null : null],
    );
    return { statements: rows.map((row) => ({
      titleId: row.title_id, titleName: row.title_name, titleStatus: row.title_status,
      grossAllocatedPaise: Number(row.gross_allocated_paise), approvedPaise: Number(row.approved_paise),
      paidPaise: Number(row.paid_paise), pendingPaise: Number(row.pending_paise),
    })) };
  });

export const getTitleFinanceControlCentre = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.read");
    const sql = await getSql();
    const [receipts, owners, investors, allocations, reconciliations] = await Promise.all([
      sql.query("select r.id,r.title_id,t.name as title_name,r.contract_reference,r.payment_reference,r.gross_amount_paise,r.tax_amount_paise,r.deduction_amount_paise,r.net_amount_paise,r.verification_status,r.recorded_at from public.bridge_licensing_receipts r join public.bridge_titles t on t.id=r.title_id order by r.recorded_at desc limit 200"),
      sql.query("select o.id,o.title_id,t.name as title_name,o.owner_user_id,o.owner_account_type,o.share_bps,o.agreement_reference,o.status,o.evidence_url from public.bridge_title_owner_interests o join public.bridge_titles t on t.id=o.title_id order by o.created_at desc limit 200"),
      sql.query("select i.id,i.title_id,t.name as title_name,i.investor_user_id,i.agreement_reference,i.return_model,i.share_bps,i.cap_amount_paise,i.status,i.evidence_url from public.bridge_investment_agreements i join public.bridge_titles t on t.id=i.title_id order by i.created_at desc limit 200"),
      sql.query("select a.id,a.receipt_id,a.title_id,t.name as title_name,a.beneficiary_type,a.beneficiary_user_id,a.amount_paise,a.status,a.settlement_reference from public.bridge_licensing_allocations a join public.bridge_titles t on t.id=a.title_id order by a.created_at desc limit 300"),
      sql.query("select id,reconciliation_number,period_start,period_end,receipt_count,verified_receipts_paise,allocated_paise,variance_paise,status,created_at from public.bridge_finance_reconciliations order by created_at desc limit 100"),
    ]);
    return { receipts, owners, investors, allocations, reconciliations };
  });

export const recordLicensingReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(receiptInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.licensing_record");
    if (data.grossAmountPaise < data.taxAmountPaise + data.deductionAmountPaise) throw new Error("Tax and deductions cannot exceed gross receipt.");
    const sql = await getSql();
    const eligible = await sql.query<{ id: string }>(
      "select t.id from public.bridge_titles t join public.bridge_rights_grants g on g.id=$2 and g.title_id=t.id where t.id=$1 and t.status in ('LICENSED','DELIVERED') and g.status='VALID' and g.window_start<=now() and g.window_end>now() limit 1",
      [data.titleId, data.rightsGrantId],
    );
    if (!eligible[0]) throw new Error("A currently valid rights grant and LICENSED/DELIVERED title are required.");
    const inserted = await sql.query<{ id: string }>(
      "insert into public.bridge_licensing_receipts(title_id,rights_grant_id,buyer_user_id,contract_reference,payment_reference,gross_amount_paise,tax_amount_paise,deduction_amount_paise,evidence_url,recorded_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
      [data.titleId,data.rightsGrantId,data.buyerUserId ?? null,data.contractReference,data.paymentReference,data.grossAmountPaise,data.taxAmountPaise,data.deductionAmountPaise,data.evidenceUrl,actor.userId],
    );
    const receiptId = inserted[0]?.id;
    if (!receiptId) throw new Error("Licensing receipt could not be recorded.");
    await writeAudit({ actorUserId: actor.userId, action: "finance.licensing_receipt_recorded", entityType: "bridge_licensing_receipt", entityId: receiptId, metadata: { titleId: data.titleId, paymentReference: data.paymentReference, grossAmountPaise: data.grossAmountPaise, status: "PENDING" } });
    return { receiptId, status: "PENDING" as const };
  });

export const verifyLicensingReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ receiptId: z.string().uuid(), verificationNote: z.string().min(5).max(1000) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.licensing_record");
    const sql = await getSql();
    const updated = await sql.query<{ id: string; title_id: string; net_amount_paise: number }>(
      "update public.bridge_licensing_receipts set verification_status='VERIFIED',verified_by=$2,verified_at=now() where id=$1 and verification_status='PENDING' returning id,title_id,net_amount_paise",
      [data.receiptId, actor.userId],
    );
    const receipt = updated[0];
    if (!receipt) throw new Error("Only a pending licensing receipt can be verified.");
    await writeAudit({ actorUserId: actor.userId, action: "finance.licensing_receipt_verified", entityType: "bridge_licensing_receipt", entityId: receipt.id, metadata: { titleId: receipt.title_id, netAmountPaise: Number(receipt.net_amount_paise), verificationNote: data.verificationNote } });
    return { receiptId: receipt.id, status: "VERIFIED" as const };
  });

export const submitTitleOwnerInterests = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(ownerInterestInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.ownership_manage");
    assertOwnerInterestShares(data.interests);
    const sql = await getSql();
    const title = await sql.query<{ id: string }>("select id from public.bridge_titles where id=$1 limit 1", [data.titleId]);
    if (!title[0]) throw new Error("Title not found.");
    return sql.transaction(async (tx) => {
      const created: string[] = [];
      for (const interest of data.interests) {
        const profile = await tx.query<{ user_id: string; account_type: string; organization_id: string | null }>(
          "select user_id,account_type,organization_id from public.bridge_profiles where user_id=$1 limit 1",
          [interest.ownerUserId],
        );
        if (!profile[0] || profile[0].account_type !== interest.ownerAccountType) throw new Error("Owner profile/account type could not be verified.");
        if (interest.ownerAccountType === "studio" && (!interest.ownerOrganizationId || profile[0].organization_id !== interest.ownerOrganizationId)) throw new Error("Studio ownership must match the verified profile organization.");
        if (interest.ownerAccountType === "independent_creator" && interest.ownerOrganizationId) throw new Error("Independent Creator ownership cannot claim a Studio organization.");
        const row = await tx.query<{ id: string }>(
          "insert into public.bridge_title_owner_interests(title_id,owner_user_id,owner_account_type,owner_organization_id,share_bps,agreement_reference,evidence_url,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
          [data.titleId,interest.ownerUserId,interest.ownerAccountType,interest.ownerOrganizationId ?? null,interest.shareBps,interest.agreementReference,interest.evidenceUrl,actor.userId],
        );
        if (row[0]) created.push(row[0].id);
      }
      await writeAudit({ actorUserId: actor.userId, action: "finance.title_owner_interests_submitted", entityType: "bridge_title", entityId: data.titleId, metadata: { interestIds: created, totalShareBps: 10000 } }, tx);
      return { interestIds: created, status: "PENDING_VERIFICATION" as const };
    });
  });

export const verifyTitleOwnerInterests = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8), interestIds: z.array(z.string().uuid()).min(1).max(20) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.ownership_manage");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const rows = await tx.query<{ id: string; owner_user_id: string; share_bps: number; status: string }>(
        "select id,owner_user_id,share_bps,status from public.bridge_title_owner_interests where title_id=$1 and id=any($2::uuid[]) for update",
        [data.titleId, data.interestIds],
      );
      if (rows.length !== data.interestIds.length || rows.some((row) => row.status !== "PENDING_VERIFICATION")) throw new Error("Every selected owner interest must be pending verification for this title.");
      assertOwnerInterestShares(rows.map((row) => ({ ownerUserId: row.owner_user_id, shareBps: Number(row.share_bps) })));
      await tx.query("update public.bridge_title_owner_interests set status='SUPERSEDED',updated_at=now() where title_id=$1 and status='VERIFIED'", [data.titleId]);
      await tx.query("update public.bridge_title_owner_interests set status='VERIFIED',verified_by=$2,verified_at=now(),updated_at=now() where title_id=$1 and id=any($3::uuid[])", [data.titleId,actor.userId,data.interestIds]);
      await writeAudit({ actorUserId: actor.userId, action: "finance.title_owner_interests_verified", entityType: "bridge_title", entityId: data.titleId, metadata: { interestIds: data.interestIds, totalShareBps: 10000 } }, tx);
      return { titleId: data.titleId, status: "VERIFIED" as const };
    });
  });

export const submitInvestmentAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(investorAgreementInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.investment_manage");
    if (data.returnModel === "FIXED_CAP" && !data.capAmountPaise) throw new Error("A fixed-cap agreement requires a positive cap.");
    if (data.returnModel === "REVENUE_SHARE" && data.capAmountPaise != null) throw new Error("Revenue-share agreement cannot carry a fixed cap.");
    const sql = await getSql();
    const investor = await sql.query<{ user_id: string }>("select user_id from public.bridge_profiles where user_id=$1 and account_type='investor' limit 1", [data.investorUserId]);
    if (!investor[0]) throw new Error("Investor account could not be verified.");
    const row = await sql.query<{ id: string }>(
      "insert into public.bridge_investment_agreements(title_id,investor_user_id,agreement_reference,return_model,share_bps,cap_amount_paise,evidence_url,effective_from,effective_to,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
      [data.titleId,data.investorUserId,data.agreementReference,data.returnModel,data.shareBps,data.capAmountPaise ?? null,data.evidenceUrl,data.effectiveFrom,data.effectiveTo ?? null,actor.userId],
    );
    if (!row[0]) throw new Error("Investment agreement could not be recorded.");
    await writeAudit({ actorUserId: actor.userId, action: "finance.investment_agreement_submitted", entityType: "bridge_investment_agreement", entityId: row[0].id, metadata: { titleId: data.titleId, investorUserId: data.investorUserId, returnModel: data.returnModel, shareBps: data.shareBps } });
    return { agreementId: row[0].id, status: "PENDING_APPROVAL" as const };
  });

export const approveInvestmentAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ agreementId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.investment_manage");
    const sql = await getSql();
    const row = await sql.query<{ id: string; title_id: string; investor_user_id: string }>(
      "update public.bridge_investment_agreements set status='APPROVED',approved_by=$2,approved_at=now(),updated_at=now() where id=$1 and status='PENDING_APPROVAL' returning id,title_id,investor_user_id",
      [data.agreementId,actor.userId],
    );
    if (!row[0]) throw new Error("Only a pending investment agreement can be approved.");
    await writeAudit({ actorUserId: actor.userId, action: "finance.investment_agreement_approved", entityType: "bridge_investment_agreement", entityId: row[0].id, metadata: { titleId: row[0].title_id, investorUserId: row[0].investor_user_id } });
    return { agreementId: row[0].id, status: "APPROVED" as const };
  });

export const createLicensingAllocations = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(allocationsInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.allocate");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const receiptRows = await tx.query<{ id: string; title_id: string; net_amount_paise: number; verification_status: string }>(
        "select id,title_id,net_amount_paise,verification_status from public.bridge_licensing_receipts where id=$1 for update",
        [data.receiptId],
      );
      const receipt = receiptRows[0];
      if (!receipt || receipt.verification_status !== "VERIFIED") throw new Error("Allocations require a verified licensing receipt.");
      const existingTotals = await tx.query<{ amount_paise: number }>(
        "select coalesce(sum(amount_paise),0)::bigint as amount_paise from public.bridge_licensing_allocations where receipt_id=$1 and status<>'CANCELLED'",
        [data.receiptId],
      );
      const alreadyAllocated = Number(existingTotals[0]?.amount_paise ?? 0);
      const requested = assertAllocationsWithinNetRevenue(Number(receipt.net_amount_paise) - alreadyAllocated, data.allocations);
      const beneficiaries = data.allocations.map((item) => item.beneficiaryType + ":" + (item.beneficiaryType === "BRIDGE" ? "bridge" : item.beneficiaryUserId));
      if (new Set(beneficiaries).size !== beneficiaries.length) throw new Error("Each beneficiary may receive only one allocation per receipt.");
      const created: string[] = [];
      for (const item of data.allocations) {
        if (item.beneficiaryType === "OWNER") {
          const interestRows = await tx.query<{ owner_user_id: string; share_bps: number; status: string }>(
            "select owner_user_id,share_bps,status from public.bridge_title_owner_interests where id=$1 and title_id=$2 limit 1",
            [item.ownerInterestId,receipt.title_id],
          );
          const interest = interestRows[0];
          if (!interest || interest.status !== "VERIFIED" || interest.owner_user_id !== item.beneficiaryUserId) throw new Error("Owner allocation requires a matching verified title ownership interest.");
          const priorOwnerRows = await tx.query<{ amount_paise: number }>(
            "select coalesce(sum(amount_paise),0)::bigint as amount_paise from public.bridge_licensing_allocations where receipt_id=$1 and owner_interest_id=$2 and status<>'CANCELLED'",
            [data.receiptId,item.ownerInterestId],
          );
          const ownerRemaining = Math.max(0, ownerEntitlementPaise(Number(receipt.net_amount_paise), Number(interest.share_bps)) - Number(priorOwnerRows[0]?.amount_paise ?? 0));
          if (item.amountPaise > ownerRemaining) throw new Error("Owner allocation exceeds the remaining verified ownership share.");
        } else if (item.beneficiaryType === "INVESTOR") {
          const agreementRows = await tx.query<{ investor_user_id: string; share_bps: number; cap_amount_paise: number | null; return_model: string; status: string; effective_from: string; effective_to: string | null }>(
            "select investor_user_id,share_bps,cap_amount_paise,return_model,status,effective_from,effective_to from public.bridge_investment_agreements where id=$1 and title_id=$2 limit 1",
            [item.investmentAgreementId,receipt.title_id],
          );
          const agreement = agreementRows[0];
          if (!agreement || agreement.status !== "APPROVED" || agreement.investor_user_id !== item.beneficiaryUserId || new Date(agreement.effective_from).getTime() > Date.now() || (agreement.effective_to && new Date(agreement.effective_to).getTime() <= Date.now())) throw new Error("Investor allocation requires a current approved agreement for this title.");
          let maxAmount = ownerEntitlementPaise(Number(receipt.net_amount_paise), Number(agreement.share_bps));
          if (agreement.return_model === "FIXED_CAP") {
            const prior = await tx.query<{ amount_paise: number }>(
              "select coalesce(sum(amount_paise),0)::bigint as amount_paise from public.bridge_licensing_allocations where investment_agreement_id=$1 and status in ('PENDING_APPROVAL','APPROVED','ON_HOLD','PAID')",
              [item.investmentAgreementId],
            );
            maxAmount = Math.min(maxAmount, investorRemainingCap(agreement.cap_amount_paise == null ? null : Number(agreement.cap_amount_paise), Number(prior[0]?.amount_paise ?? 0)) ?? maxAmount);
          }
          if (item.amountPaise > maxAmount) throw new Error("Investor allocation exceeds the approved agreement return limit.");
        }
        const row = await tx.query<{ id: string }>(
          "insert into public.bridge_licensing_allocations(receipt_id,title_id,beneficiary_type,beneficiary_user_id,owner_interest_id,investment_agreement_id,amount_paise,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
          [data.receiptId,receipt.title_id,item.beneficiaryType,item.beneficiaryType === "BRIDGE" ? null : item.beneficiaryUserId,item.beneficiaryType === "OWNER" ? item.ownerInterestId : null,item.beneficiaryType === "INVESTOR" ? item.investmentAgreementId : null,item.amountPaise,actor.userId],
        );
        if (row[0]) created.push(row[0].id);
      }
      await writeAudit({ actorUserId: actor.userId, action: "finance.licensing_allocations_created", entityType: "bridge_licensing_receipt", entityId: data.receiptId, metadata: { allocationIds: created, allocatedPaise: data.allocations.reduce((sum,item)=>sum+item.amountPaise,0) } }, tx);
      return { allocationIds: created, status: "PENDING_APPROVAL" as const };
    });
  });

export const approveLicensingAllocation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ allocationId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.allocate");
    const sql = await getSql();
    const row = await sql.query<{ id: string; receipt_id: string; amount_paise: number }>(
      "update public.bridge_licensing_allocations a set status='APPROVED',approved_by=$2,approved_at=now() from public.bridge_licensing_receipts r where a.id=$1 and a.receipt_id=r.id and r.verification_status='VERIFIED' and a.status='PENDING_APPROVAL' returning a.id,a.receipt_id,a.amount_paise",
      [data.allocationId,actor.userId],
    );
    if (!row[0]) throw new Error("Only a pending allocation backed by a verified receipt can be approved.");
    await writeAudit({ actorUserId: actor.userId, action: "finance.licensing_allocation_approved", entityType: "bridge_licensing_allocation", entityId: row[0].id, metadata: { receiptId: row[0].receipt_id, amountPaise: Number(row[0].amount_paise) } });
    return { allocationId: row[0].id, status: "APPROVED" as const };
  });

export const markLicensingAllocationPaid = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ allocationId: z.string().uuid(), settlementReference: z.string().min(3).max(200), settlementEvidenceUrl: httpsUrl }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.allocate");
    const sql = await getSql();
    const row = await sql.query<{ id: string; amount_paise: number; title_id: string }>(
      "update public.bridge_licensing_allocations set status='PAID',paid_by=$2,paid_at=now(),settlement_reference=$3,settlement_evidence_url=$4 where id=$1 and status='APPROVED' returning id,amount_paise,title_id",
      [data.allocationId,actor.userId,data.settlementReference,data.settlementEvidenceUrl],
    );
    if (!row[0]) throw new Error("Only an approved allocation can be marked paid.");
    await writeAudit({ actorUserId: actor.userId, action: "finance.licensing_allocation_paid", entityType: "bridge_licensing_allocation", entityId: row[0].id, metadata: { titleId: row[0].title_id, amountPaise: Number(row[0].amount_paise), settlementReference: data.settlementReference } });
    return { allocationId: row[0].id, status: "PAID" as const };
  });

export const createFinanceReconciliation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reconciliationInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.reconcile");
    if (data.periodEnd < data.periodStart) throw new Error("Reconciliation period end must not precede its start.");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const receipts = await tx.query<{ id: string; net_amount_paise: number }>(
        "select id,net_amount_paise from public.bridge_licensing_receipts where verification_status='VERIFIED' and recorded_at::date between $1::date and $2::date order by recorded_at for update",
        [data.periodStart,data.periodEnd],
      );
      let allocatedTotal = 0;
      const items: Array<{ receiptId: string; expected: number; allocated: number }> = [];
      for (const receipt of receipts) {
        const allocations = await tx.query<{ amount_paise: number }>(
          "select coalesce(sum(amount_paise),0)::bigint as amount_paise from public.bridge_licensing_allocations where receipt_id=$1 and status in ('APPROVED','PAID')",
          [receipt.id],
        );
        const allocated = Number(allocations[0]?.amount_paise ?? 0);
        allocatedTotal += allocated;
        items.push({ receiptId: receipt.id, expected: Number(receipt.net_amount_paise), allocated });
      }
      const totalReceipts = receipts.reduce((sum,row)=>sum+Number(row.net_amount_paise),0);
      const reconciliationNumber = "BR-REC-" + data.periodStart.replaceAll("-","") + "-" + data.periodEnd.replaceAll("-","") + "-" + Math.random().toString(36).slice(2,8).toUpperCase();
      const variance = totalReceipts - allocatedTotal;
      const created = await tx.query<{ id: string }>(
        "insert into public.bridge_finance_reconciliations(reconciliation_number,period_start,period_end,receipt_count,verified_receipts_paise,allocated_paise,variance_paise,status,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9) returning id",
        [reconciliationNumber,data.periodStart,data.periodEnd,receipts.length,totalReceipts,allocatedTotal,variance,data.notes,actor.userId],
      );
      if (!created[0]) throw new Error("Reconciliation could not be created.");
      for (const item of items) {
        await tx.query(
          "insert into public.bridge_finance_reconciliation_items(reconciliation_id,receipt_id,expected_amount_paise,reconciled_amount_paise,match_status,note) values($1,$2,$3,$4,$5,$6)",
          [created[0].id,item.receiptId,item.expected,item.allocated,item.expected===item.allocated?"MATCHED":"VARIANCE",item.expected===item.allocated?"":"Allocation does not equal verified net receipt."],
        );
      }
      await writeAudit({ actorUserId: actor.userId, action: "finance.reconciliation_created", entityType: "bridge_finance_reconciliation", entityId: created[0].id, metadata: { reconciliationNumber, receiptCount: receipts.length, verifiedReceiptsPaise: totalReceipts, allocatedPaise: allocatedTotal, variancePaise: variance } }, tx);
      return { reconciliationId: created[0].id, reconciliationNumber, receiptCount: receipts.length, variancePaise: variance, status: "DRAFT" as const };
    });
  });

export const approveFinanceReconciliation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reconciliationId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor, "finance.reconcile");
    const sql = await getSql();
    const row = await sql.query<{ id: string; variance_paise: number }>(
      "update public.bridge_finance_reconciliations r set status='APPROVED',approved_by=$2,approved_at=now() where r.id=$1 and r.status in ('DRAFT','IN_REVIEW') and r.variance_paise=0 and not exists(select 1 from public.bridge_finance_reconciliation_items i where i.reconciliation_id=r.id and i.match_status<>'MATCHED') returning r.id,r.variance_paise",
      [data.reconciliationId,actor.userId],
    );
    if (!row[0]) throw new Error("Only a zero-variance reconciliation with all receipt allocations matched can be approved.");
    await writeAudit({ actorUserId: actor.userId, action: "finance.reconciliation_approved", entityType: "bridge_finance_reconciliation", entityId: row[0].id, metadata: { variancePaise: Number(row[0].variance_paise) } });
    return { reconciliationId: row[0].id, status: "APPROVED" as const };
  });
