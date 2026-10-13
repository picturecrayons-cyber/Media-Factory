import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

async function verifiedActor(userId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (!actor.emailVerified) throw new Error("Email verification required");
  return actor;
}
function requireInternal(actor: Awaited<ReturnType<typeof verifiedActor>>) {
  if (!actor.internalRole || !["admin", "super_admin", "legal_reviewer", "finance"].includes(actor.internalRole)) {
    throw new Error("Forbidden");
  }
}
const offerInput = z.object({
  titleId: z.string().min(1).max(128),
  minimumAmountPaise: z.number().int().min(100).max(10_000_000_000),
  targetAmountPaise: z.number().int().min(100).max(10_000_000_000),
  maximumAmountPaise: z.number().int().min(100).max(10_000_000_000),
  participationBasis: z.enum(["NET_DISTRIBUTION_RECEIPTS", "GROSS_DISTRIBUTION_RECEIPTS", "FIXED_ECONOMIC_SHARE"]),
  participationPercent: z.number().min(0.01).max(100).nullable(),
  tenureMonths: z.number().int().min(1).max(240),
  rightsIncluded: z.array(z.string().min(2).max(120)).min(1).max(30),
  rightsExcluded: z.array(z.string().min(2).max(120)).min(1).max(30),
  territories: z.array(z.string().min(2).max(80)).min(1).max(50),
  languages: z.array(z.string().min(2).max(60)).min(1).max(30),
  media: z.array(z.string().min(2).max(80)).min(1).max(30),
  windowStart: z.string().date().nullable(),
  windowEnd: z.string().date().nullable(),
  termsSummary: z.string().min(20).max(5000),
}).refine((v) => v.minimumAmountPaise <= v.targetAmountPaise && v.targetAmountPaise <= v.maximumAmountPaise, {
  message: "Minimum must be no greater than target, and target no greater than maximum.",
}).refine((v) => !v.windowStart || !v.windowEnd || v.windowStart <= v.windowEnd, {
  message: "Rights window end must not precede its start.",
}).refine((v) => v.participationBasis === "FIXED_ECONOMIC_SHARE" ? v.participationPercent === null : v.participationPercent !== null, {
  message: "Net/gross receipts require a participation percentage; fixed economic share must be defined in the approved terms without a percentage field.",
});

export const listAdminInvestmentOffers = createServerFn({ method: "GET" })
  .middleware([authMiddleware]).handler(async ({ context }) => {
    const actor = await verifiedActor(context.userId); requireInternal(actor);
    const sql = await getSql();
    const [offers, titles] = await Promise.all([
      sql`select o.*, t.name as title_name, t.status as title_status
          from bridge_title_investment_offers o
          join bridge_titles t on t.id = o.title_id
          order by o.updated_at desc limit 300`,
      sql`select id, name, status, language, content_type from bridge_titles
          where status in ('LICENSING_READY','LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
          order by updated_at desc limit 300`,
    ]);
    return JSON.parse(JSON.stringify({ offers, eligibleTitles: titles }, (_, v) => typeof v === "bigint" ? v.toString() : v));
  });

export const createInvestmentOfferDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).validator(offerInput).handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId); requireInternal(actor);
    if (!["admin", "super_admin"].includes(actor.internalRole ?? "")) throw new Error("Admin role required to configure an offer.");
    const sql = await getSql();
    const titles = await sql<{id:string; status:string}>`select id, status from bridge_titles where id = ${data.titleId} limit 1`;
    const title = titles[0];
    if (!title) throw new Error("Title not found.");
    if (!["LICENSING_READY","LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED","DELIVERED"].includes(title.status)) {
      throw new Error("Title must pass Bridge rights/QC readiness before an investment offer can be drafted.");
    }
    const id = randomUUID();
    await sql`insert into bridge_title_investment_offers
      (id, title_id, created_by, minimum_amount_paise, target_amount_paise, maximum_amount_paise,
       participation_basis, participation_percent, tenure_months, rights_included, rights_excluded,
       territories, languages, media, window_start, window_end, terms_summary, status, created_at, updated_at)
      values (${id}, ${data.titleId}, ${actor.userId}, ${data.minimumAmountPaise}, ${data.targetAmountPaise},
       ${data.maximumAmountPaise}, ${data.participationBasis}, ${data.participationPercent},
       ${data.tenureMonths}, ${JSON.stringify(data.rightsIncluded)}::jsonb, ${JSON.stringify(data.rightsExcluded)}::jsonb,
       ${data.territories}, ${data.languages}, ${data.media}, ${data.windowStart}, ${data.windowEnd},
       ${data.termsSummary}, 'DRAFT', now(), now())`;
    await writeAudit({ actorUserId: actor.userId, action: "investment_offer.draft_created", entityType: "bridge_title_investment_offer", entityId: id, metadata: { titleId: data.titleId } });
    return { ok: true, offerId: id, status: "DRAFT" };
  });

const reviewInput = z.object({ offerId: z.string().uuid(), decision: z.enum(["SUBMIT_FOR_REVIEW","APPROVE_LEGAL","RETURN_FOR_CHANGES","PUBLISH","PAUSE"]), reviewReference: z.string().trim().min(3).max(500).optional(), notes: z.string().max(3000).optional() });
export const transitionInvestmentOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).validator(reviewInput).handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId); requireInternal(actor);
    const sql = await getSql();

    // Lock the offer and write the transition + audit record in one transaction.
    // The status predicate on UPDATE is an additional compare-and-swap guard.
    return sql.transaction(async (tx) => {
      const rows = await tx<{id:string; status:string; created_by:string; reviewed_by:string | null}>`select id, status, created_by, reviewed_by
          from bridge_title_investment_offers
          where id = ${data.offerId}
          for update`;
      const offer = rows[0];
      if (!offer) throw new Error("Offer not found.");

      let status = offer.status;
      if (data.decision === "SUBMIT_FOR_REVIEW") {
        if (!["admin","super_admin"].includes(actor.internalRole ?? "") || status !== "DRAFT") {
          throw new Error("Only an admin can submit a draft for legal review.");
        }
        status = "LEGAL_REVIEW";
      } else if (data.decision === "APPROVE_LEGAL") {
        if (actor.internalRole !== "legal_reviewer" || status !== "LEGAL_REVIEW") {
          throw new Error("A dedicated legal reviewer and a pending review are required.");
        }
        if (actor.userId === offer.created_by) {
          throw new Error("The offer creator cannot approve their own offer.");
        }
        if (!data.reviewReference) throw new Error("Record the approved legal/compliance document reference before approval.");
        status = "APPROVED";
      } else if (data.decision === "RETURN_FOR_CHANGES") {
        if (actor.internalRole !== "legal_reviewer" || status !== "LEGAL_REVIEW") {
          throw new Error("A dedicated legal reviewer is required to return this offer.");
        }
        status = "DRAFT";
      } else if (data.decision === "PUBLISH") {
        if (actor.internalRole !== "super_admin" || status !== "APPROVED") {
          throw new Error("Only a super admin can publish a legally approved offer.");
        }
        if (offer.reviewed_by === actor.userId) {
          throw new Error("The legal reviewer cannot publish the same offer.");
        }
        status = "PUBLISHED";
      } else if (data.decision === "PAUSE") {
        if (!["admin","super_admin"].includes(actor.internalRole ?? "") || !["PUBLISHED","APPROVED"].includes(status)) {
          throw new Error("Offer cannot be paused in its current state.");
        }
        status = "PAUSED";
      }

      let updated: { id: string }[];
      if (data.decision === "APPROVE_LEGAL") {
        updated = await tx`update bridge_title_investment_offers
          set status=${status}, review_reference=${data.reviewReference},
              reviewed_by=${actor.userId}, approved_at=now(),
              review_notes=${data.notes ?? null}, updated_at=now()
          where id=${data.offerId} and status=${offer.status}
          returning id`;
      } else if (data.decision === "PUBLISH") {
        updated = await tx`update bridge_title_investment_offers
          set status=${status}, published_by=${actor.userId}, published_at=now(), updated_at=now()
          where id=${data.offerId} and status=${offer.status}
          returning id`;
      } else {
        updated = await tx`update bridge_title_investment_offers
          set status=${status}, review_notes=${data.notes ?? null}, updated_at=now()
          where id=${data.offerId} and status=${offer.status}
          returning id`;
      }
      if (updated.length !== 1) throw new Error("Offer changed concurrently. Refresh the queue and retry.");

      await writeAudit({
        actorUserId: actor.userId,
        action: "investment_offer." + data.decision.toLowerCase(),
        entityType: "bridge_title_investment_offer",
        entityId: data.offerId,
        metadata: { from: offer.status, to: status, reviewReference: data.reviewReference ?? null },
      }, tx);
      return { ok: true, status };
    });
  });

export const listPublishedInvestmentOffers = createServerFn({ method: "GET" })
  .middleware([authMiddleware]).handler(async ({ context }) => {
    const actor = await verifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "investor") throw new Error("Investor account required.");
    const sql = await getSql();
    const offers = await sql`select o.id, o.title_id, t.name as title_name, t.language, t.content_type,
      o.minimum_amount_paise, o.target_amount_paise, o.maximum_amount_paise, o.participation_basis,
      o.participation_percent, o.tenure_months, o.rights_included, o.rights_excluded,
      o.territories, o.languages, o.media, o.window_start, o.window_end, o.terms_summary, o.published_at
      from bridge_title_investment_offers o join bridge_titles t on t.id=o.title_id
      where o.status='PUBLISHED' and t.status in ('LICENSING_READY','LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
      order by o.published_at desc limit 100`;
    const interests = await sql`select offer_id, status, created_at from bridge_investment_interests where investor_user_id=${actor.userId} order by created_at desc limit 300`;
    return JSON.parse(JSON.stringify({ offers, interests }, (_, v) => typeof v === "bigint" ? v.toString() : v));
  });

const interestInput = z.object({ offerId: z.string().uuid(), amountPaise: z.number().int().min(100).max(10_000_000_000), note: z.string().max(1000).optional() });
export const requestInvestmentInformation = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).validator(interestInput).handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "investor") throw new Error("Investor account required.");
    const sql = await getSql();
    const rows = await sql<{id:string; minimum_amount_paise:number; maximum_amount_paise:number}>`select id, minimum_amount_paise, maximum_amount_paise from bridge_title_investment_offers where id=${data.offerId} and status='PUBLISHED' limit 1`;
    const offer = rows[0]; if (!offer) throw new Error("Published offer not found.");
    if (data.amountPaise < Number(offer.minimum_amount_paise) || data.amountPaise > Number(offer.maximum_amount_paise)) throw new Error("Requested amount is outside this offer's stated range.");
    return sql.transaction(async (tx) => {
      const published = await tx`select id from bridge_title_investment_offers where id=${data.offerId} and status='PUBLISHED' for share`;
      if (!published.length) throw new Error("This offer is no longer available.");
      const persisted = await tx<{id:string}>`insert into bridge_investment_interests (id, offer_id, investor_user_id, requested_amount_paise, note, status, created_at, updated_at)
        values (${randomUUID()}, ${data.offerId}, ${actor.userId}, ${data.amountPaise}, ${data.note ?? null}, 'INFORMATION_REQUESTED', now(), now())
        on conflict (offer_id, investor_user_id) do update
          set requested_amount_paise=excluded.requested_amount_paise, note=excluded.note,
              status='INFORMATION_REQUESTED', updated_at=now()
        returning id`;
      const persistedId = persisted[0]?.id;
      if (!persistedId) throw new Error("Information request was not persisted.");
      await writeAudit({ actorUserId: actor.userId, action: "investment_offer.information_requested", entityType: "bridge_investment_interest", entityId: persistedId, metadata: { offerId: data.offerId } }, tx);
      return { ok: true, status: "INFORMATION_REQUESTED", requestId: persistedId };
    });
  });
