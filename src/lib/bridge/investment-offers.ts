import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";

async function actorFor(userId: string) {
  assertNotDevUser(userId);
  return requireVerifiedActor(userId);
}

function requireAdmin(actor: Awaited<ReturnType<typeof actorFor>>) {
  if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
    throw new Error("Administrator access required");
  }
}

const offerInput = z.object({
  titleId: z.string().min(1).max(200),
  minimumAmountPaise: z.number().int().positive().max(100_000_000_000),
  maximumAmountPaise: z.number().int().positive().max(100_000_000_000),
  targetAmountPaise: z.number().int().positive().max(100_000_000_000),
  applicationIncrementPaise: z.number().int().positive().max(100_000_000_000),
  participationBasis: z.string().trim().min(3).max(500),
  participationPercent: z.number().min(0).max(100).nullable(),
  participationFormula: z.string().trim().min(5).max(4000),
  receiptScope: z.string().trim().min(5).max(4000),
  tenureStart: z.string().date().nullable(),
  tenureMonths: z.number().int().positive().max(600),
  maturityDate: z.string().date().nullable(),
  rightsIncluded: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
  rightsExcluded: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
  permittedCosts: z.array(z.string().trim().min(1).max(500)).max(50),
  recoupmentPriority: z.string().trim().min(5).max(4000),
  distributionFrequency: z.string().trim().min(3).max(500),
  calculationMethod: z.string().trim().min(5).max(4000),
  informationMemorandumUrl: z.string().url().max(2000).nullable(),
  termsDocumentUrl: z.string().url().max(2000).nullable(),
  riskDisclosure: z.string().trim().min(50).max(10000),
  rightsEvidenceReference: z.string().trim().min(5).max(2000),
});

export const listPublishedInvestmentOffers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    if (actor.accountType !== "investor" || actor.internalRole) throw new Error("Investor account required");
    const sql = await getSql();
    const rows = await sql<{
      id: string; title_id: string; title_name: string; version: number; currency: string;
      minimum_amount_paise: number | string; maximum_amount_paise: number | string;
      target_amount_paise: number | string; application_increment_paise: number | string;
      participation_basis: string; participation_percent: number | string | null;
      participation_formula: string; receipt_scope: string; tenure_start: string | null;
      tenure_months: number; maturity_date: string | null; rights_included: unknown;
      rights_excluded: unknown; permitted_costs: unknown; recoupment_priority: string;
      distribution_frequency: string; calculation_method: string; information_memorandum_url: string | null;
      terms_document_url: string | null; risk_disclosure: string; eligibility_rules: unknown; published_at: string;
    }>`select o.id, o.title_id, t.name as title_name, o.version, o.currency,
        o.minimum_amount_paise, o.maximum_amount_paise, o.target_amount_paise,
        o.application_increment_paise, o.participation_basis, o.participation_percent,
        o.participation_formula, o.receipt_scope, o.tenure_start, o.tenure_months,
        o.maturity_date, o.rights_included, o.rights_excluded, o.permitted_costs,
        o.recoupment_priority, o.distribution_frequency, o.calculation_method,
        o.information_memorandum_url, o.terms_document_url, o.risk_disclosure,
        o.eligibility_rules, o.published_at
      from bridge_title_investment_offers o
      join bridge_titles t on t.id = o.title_id
      where o.status = 'PUBLISHED'
        and t.status in ('LICENSING_READY','LIVE_FOR_BUYERS')
      order by o.published_at desc limit 100`;
    return { offers: JSON.parse(JSON.stringify(rows)) as typeof rows };
  });

export const listAdminInvestmentOffers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    requireAdmin(actor);
    const sql = await getSql();
    const rows = await sql<{
      id: string; title_id: string; title_name: string; version: number; status: string;
      minimum_amount_paise: number | string; maximum_amount_paise: number | string;
      target_amount_paise: number | string; participation_basis: string; tenure_months: number;
      created_by: string; legal_reviewer_user_id: string | null; approved_by: string | null;
      published_by: string | null; updated_at: string;
    }>`select o.id, o.title_id, t.name as title_name, o.version, o.status,
        o.minimum_amount_paise, o.maximum_amount_paise, o.target_amount_paise,
        o.participation_basis, o.tenure_months, o.created_by, o.legal_reviewer_user_id,
        o.approved_by, o.published_by, o.updated_at
      from bridge_title_investment_offers o
      join bridge_titles t on t.id = o.title_id
      order by o.updated_at desc limit 200`;
    return { offers: JSON.parse(JSON.stringify(rows)) };
  });

export const createInvestmentOfferDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(offerInput)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    requireAdmin(actor);
    if (data.maximumAmountPaise < data.minimumAmountPaise ||
        data.targetAmountPaise < data.minimumAmountPaise ||
        data.targetAmountPaise > data.maximumAmountPaise ||
        data.minimumAmountPaise % data.applicationIncrementPaise !== 0 ||
        data.maximumAmountPaise % data.applicationIncrementPaise !== 0) {
      throw new Error("Offer amount limits or increments are inconsistent");
    }
    const sql = await getSql();
    const title = await sql<{ id: string; status: string }>`select id, status from bridge_titles where id = ${data.titleId} limit 1`;
    if (!title[0] || !["LICENSING_READY", "LIVE_FOR_BUYERS"].includes(title[0].status)) {
      throw new Error("Only licensing-ready titles can be considered. Rights and legal evidence still require independent review.");
    }
    const versions = await sql<{ version: number }>`select coalesce(max(version), 0)::int as version from bridge_title_investment_offers where title_id = ${data.titleId}`;
    const version = Number(versions[0]?.version ?? 0) + 1;
    const rows = await sql<{ id: string }>`insert into bridge_title_investment_offers (
      title_id, version, status, minimum_amount_paise, maximum_amount_paise, target_amount_paise,
      application_increment_paise, participation_basis, participation_percent, participation_formula,
      receipt_scope, tenure_start, tenure_months, maturity_date, rights_included, rights_excluded,
      permitted_costs, recoupment_priority, distribution_frequency, calculation_method,
      information_memorandum_url, terms_document_url, risk_disclosure, rights_evidence_reference,
      created_by, updated_by
    ) values (
      ${data.titleId}, ${version}, 'DRAFT', ${data.minimumAmountPaise}, ${data.maximumAmountPaise},
      ${data.targetAmountPaise}, ${data.applicationIncrementPaise}, ${data.participationBasis},
      ${data.participationPercent}, ${data.participationFormula}, ${data.receiptScope},
      ${data.tenureStart}, ${data.tenureMonths}, ${data.maturityDate}, ${JSON.stringify(data.rightsIncluded)}::jsonb,
      ${JSON.stringify(data.rightsExcluded)}::jsonb, ${JSON.stringify(data.permittedCosts)}::jsonb,
      ${data.recoupmentPriority}, ${data.distributionFrequency}, ${data.calculationMethod},
      ${data.informationMemorandumUrl}, ${data.termsDocumentUrl}, ${data.riskDisclosure},
      ${data.rightsEvidenceReference}, ${actor.userId}, ${actor.userId}
    ) returning id`;
    const id = rows[0]?.id;
    if (!id) throw new Error("Offer draft could not be created");
    await writeAudit({ actorUserId: actor.userId, action: "investment_offer.draft_created", entityType: "bridge_title_investment_offer", entityId: id, metadata: { titleId: data.titleId, version } });
    return { id, version, status: "DRAFT" as const };
  });

export const submitInvestmentOfferForLegalReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ offerId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    requireAdmin(actor);
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string; created_by: string }>`select id, status, created_by from bridge_title_investment_offers where id = ${data.offerId} for update`;
    const offer = rows[0];
    if (!offer || offer.status !== "DRAFT") throw new Error("Only a draft offer can enter legal review");
    await sql`update bridge_title_investment_offers set status = 'LEGAL_REVIEW', updated_by = ${actor.userId}, updated_at = now() where id = ${data.offerId}`;
    await writeAudit({ actorUserId: actor.userId, action: "investment_offer.submitted_for_review", entityType: "bridge_title_investment_offer", entityId: data.offerId, metadata: {} });
    return { ok: true, status: "LEGAL_REVIEW" as const };
  });

export const reviewInvestmentOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ offerId: z.string().uuid(), decision: z.enum(["APPROVE", "RETURN"]), note: z.string().trim().min(5).max(4000) }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    requireAdmin(actor);
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string; created_by: string }>`select id, status, created_by from bridge_title_investment_offers where id = ${data.offerId} limit 1`;
    const offer = rows[0];
    if (!offer || offer.status !== "LEGAL_REVIEW") throw new Error("Offer is not awaiting legal review");
    if (offer.created_by === actor.userId) throw new Error("The offer author cannot approve their own offer");
    if (data.decision === "RETURN") {
      await sql`update bridge_title_investment_offers set status = 'DRAFT', legal_reviewer_user_id = ${actor.userId}, legal_reviewed_at = now(), updated_by = ${actor.userId}, updated_at = now() where id = ${data.offerId}`;
    } else {
      await sql`update bridge_title_investment_offers set status = 'APPROVAL_PENDING', legal_reviewer_user_id = ${actor.userId}, legal_reviewed_at = now(), updated_by = ${actor.userId}, updated_at = now() where id = ${data.offerId}`;
    }
    await writeAudit({ actorUserId: actor.userId, action: data.decision === "APPROVE" ? "investment_offer.approved" : "investment_offer.returned", entityType: "bridge_title_investment_offer", entityId: data.offerId, metadata: { note: data.note } });
    return { ok: true, status: data.decision === "APPROVE" ? "APPROVAL_PENDING" as const : "DRAFT" as const };
  });

export const approveInvestmentOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ offerId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    requireAdmin(actor);
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string; created_by: string; legal_reviewer_user_id: string | null }>`select id, status, created_by, legal_reviewer_user_id from bridge_title_investment_offers where id = ${data.offerId} limit 1`;
    const offer = rows[0];
    if (!offer || offer.status !== "APPROVAL_PENDING" || !offer.legal_reviewer_user_id) throw new Error("Offer must pass independent legal review first");
    if (offer.created_by === actor.userId || offer.legal_reviewer_user_id === actor.userId) {
      throw new Error("Commercial approver must differ from the offer author and legal reviewer");
    }
    await sql`update bridge_title_investment_offers set status = 'APPROVED', approved_by = ${actor.userId}, approved_at = now(), updated_by = ${actor.userId}, updated_at = now() where id = ${data.offerId} and status = 'APPROVAL_PENDING'`;
    await writeAudit({ actorUserId: actor.userId, action: "investment_offer.commercially_approved", entityType: "bridge_title_investment_offer", entityId: data.offerId, metadata: {} });
    return { ok: true, status: "APPROVED" as const };
  });

export const publishInvestmentOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ offerId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin approval required to publish an offer");
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string; created_by: string; legal_reviewer_user_id: string | null; approved_by: string | null }>`select id, status, created_by, legal_reviewer_user_id, approved_by from bridge_title_investment_offers where id = ${data.offerId} limit 1`;
    const offer = rows[0];
    if (!offer || offer.status !== "APPROVED" || !offer.legal_reviewer_user_id || !offer.approved_by) throw new Error("Offer needs completed independent legal review and approval");
    if (offer.created_by === actor.userId || offer.legal_reviewer_user_id === actor.userId || offer.approved_by === actor.userId) {
      throw new Error("Publisher must be different from the author and reviewer");
    }
    await sql`update bridge_title_investment_offers set status = 'PUBLISHED', published_by = ${actor.userId}, published_at = now(), updated_by = ${actor.userId}, updated_at = now() where id = ${data.offerId} and status = 'APPROVED'`;
    await writeAudit({ actorUserId: actor.userId, action: "investment_offer.published", entityType: "bridge_title_investment_offer", entityId: data.offerId, metadata: { note: "Published to eligible investor catalogue" } });
    return { ok: true, status: "PUBLISHED" as const };
  });

export const submitInvestmentInterest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ offerId: z.string().uuid(), requestedAmountPaise: z.number().int().positive().max(100_000_000_000), acceptedTerms: z.literal(true), disclosureVersion: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.userId);
    if (actor.accountType !== "investor" || actor.internalRole) throw new Error("Investor account required");
    const sql = await getSql();
    const offers = await sql<{ id: string; version: number; status: string; minimum_amount_paise: number | string; maximum_amount_paise: number | string; application_increment_paise: number | string }>`select id, version, status, minimum_amount_paise, maximum_amount_paise, application_increment_paise from bridge_title_investment_offers where id = ${data.offerId} limit 1`;
    const offer = offers[0];
    if (!offer || offer.status !== "PUBLISHED") throw new Error("This offer is not currently available");
    const amount = data.requestedAmountPaise;
    const min = Number(offer.minimum_amount_paise);
    const max = Number(offer.maximum_amount_paise);
    const increment = Number(offer.application_increment_paise);
    if (amount < min || amount > max || (amount - min) % increment !== 0) throw new Error("Requested amount does not match the published offer limits");
    const rows = await sql<{ id: string }>`insert into bridge_title_investment_applications
      (offer_id, offer_version, investor_user_id, requested_amount_paise, status, accepted_terms_at, disclosure_version)
      values (${offer.id}, ${offer.version}, ${actor.userId}, ${amount}, 'INTEREST_SUBMITTED', now(), ${data.disclosureVersion})
      returning id`;
    const id = rows[0]?.id;
    if (!id) throw new Error("Interest submission could not be recorded");
    await writeAudit({ actorUserId: actor.userId, action: "investment_offer.interest_submitted", entityType: "bridge_title_investment_application", entityId: id, metadata: { offerId: offer.id, version: offer.version, amountPaise: amount } });
    return { id, status: "INTEREST_SUBMITTED" as const, paymentRequired: false };
  });

export const listMyInvestmentInterests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorFor(context.userId);
    if (actor.accountType !== "investor" || actor.internalRole) throw new Error("Investor account required");
    const sql = await getSql();
    const rows = await sql`select a.id, a.offer_id, a.offer_version, a.requested_amount_paise, a.status,
      a.eligibility_status, a.created_at, t.name as title_name
      from bridge_title_investment_applications a
      join bridge_title_investment_offers o on o.id = a.offer_id
      join bridge_titles t on t.id = o.title_id
      where a.investor_user_id = ${actor.userId}
      order by a.created_at desc limit 100`;
    return { applications: JSON.parse(JSON.stringify(rows)) as typeof rows };
  });
