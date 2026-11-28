import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";
import { loadTitle } from "./titles";
import { assertBuyerPublishable } from "./buyer-visibility";

async function verifiedActor(userId: string) {
  assertNotDevUser(userId);
  return requireVerifiedActor(userId);
}
function assertLicensingAdmin(actor: Awaited<ReturnType<typeof verifiedActor>>) {
  if (!actor.internalRole || !["admin", "super_admin"].includes(actor.internalRole)) {
    throw new Error("Verified Bridge admin access required");
  }
  assertPermission(actor, "title.read_catalog");
}

export const listLicensingWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await verifiedActor(context.userId);
    assertLicensingAdmin(actor);
    const sql = await getSql();
    const [buyers, partners, deals] = await Promise.all([
      sql`select user_id, display_name, email, organization_name, email_verified
          from bridge_profiles where account_type='buyer'
          order by display_name,email limit 500`,
      sql`select id, partner_type, legal_name, display_name, country, contact_name,
                 contact_email, status, created_at
          from bridge_distribution_partners order by created_at desc limit 300`,
      sql`select d.id,d.title_id,t.name as title_name,d.deal_type,d.partner_id,
                 p.display_name as partner_name,d.buyer_user_id,b.display_name as buyer_name,
                 b.email as buyer_email,d.territories,d.languages,d.media,d.window_start,
                 d.window_end,d.exclusivity,d.offer_fee_paise,d.delivery_specs,
                 d.agreement_reference,d.rights_grant_id,d.status,d.delivery_status,
                 d.notes,d.created_at,d.updated_at
          from bridge_distribution_deals d
          join bridge_titles t on t.id=d.title_id
          left join bridge_distribution_partners p on p.id=d.partner_id
          left join bridge_profiles b on b.user_id=d.buyer_user_id
          order by d.updated_at desc limit 500`,
    ]);
    return JSON.parse(JSON.stringify({ buyers, partners, deals }, (_, v) => v instanceof Date ? v.toISOString() : typeof v === "bigint" ? v.toString() : v));
  });

const partnerInput = z.object({
  partnerType: z.enum(["TV_CHANNEL","BROADCASTER"]),
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(160),
  country: z.string().trim().min(2).max(80),
  contactName: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().max(254).optional(),
});
export const createBroadcastPartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(partnerInput)
  .handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId);
    assertLicensingAdmin(actor);
    const sql = await getSql();
    const id = randomUUID();
    await sql`insert into bridge_distribution_partners
      (id,partner_type,legal_name,display_name,country,contact_name,contact_email,created_by)
      values (${id},${data.partnerType},${data.legalName},${data.displayName},${data.country},
      ${data.contactName || null},${data.contactEmail || null},${actor.userId})`;
    await writeAudit({actorUserId:actor.userId,action:"licensing.broadcast_partner_created",
      entityType:"bridge_distribution_partner",entityId:id,metadata:{partnerType:data.partnerType,country:data.country}});
    return { partnerId:id };
  });

const broadcastOfferInput = z.object({
  titleId: z.string().min(8),
  partnerId: z.string().uuid(),
  territories: z.array(z.string().trim().min(2).max(80)).min(1).max(100),
  languages: z.array(z.string().trim().min(2).max(40)).min(1).max(20),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  exclusivity: z.enum(["EXCLUSIVE","NON_EXCLUSIVE"]),
  offerFeePaise: z.number().int().nonnegative().max(2_000_000_000).nullable().optional(),
  media: z.array(z.string().trim().min(2).max(40)).min(1).max(20),
  videoFormat: z.string().trim().min(2).max(100),
  audioFormat: z.string().trim().min(2).max(100),
  deliveryDeadline: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const createBroadcastOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(broadcastOfferInput)
  .handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId);
    assertLicensingAdmin(actor);
    const start = new Date(data.windowStart), end = new Date(data.windowEnd);
    if (end <= start) throw new Error("Broadcast window end must be after start");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found");
    const sql = await getSql();
    const partners = await sql`select id from bridge_distribution_partners
      where id=${data.partnerId}::uuid and status='ACTIVE'`;
    if (!partners.length) throw new Error("Active broadcast partner not found");
    const id = randomUUID();
    const specs = {
      videoFormat:data.videoFormat, audioFormat:data.audioFormat,
      deliveryDeadline:data.deliveryDeadline || null,
      status:"SPECIFICATION_PENDING",
    };
    await sql`insert into bridge_distribution_deals
      (id,title_id,deal_type,partner_id,territories,languages,media,window_start,window_end,
       exclusivity,offer_fee_paise,delivery_specs,status,delivery_status,notes,created_by,updated_by)
      values (${id},${data.titleId},'BROADCAST',${data.partnerId}::uuid,
       ${JSON.stringify(data.territories)}::jsonb,${JSON.stringify(data.languages)}::jsonb,
       ${JSON.stringify(data.media)}::jsonb,${start},${end},${data.exclusivity},
       ${data.offerFeePaise ?? null},${JSON.stringify(specs)}::jsonb,'DRAFT',
       'SPECIFICATION_PENDING',${data.notes || null},${actor.userId},${actor.userId})`;
    await writeAudit({actorUserId:actor.userId,action:"licensing.broadcast_offer_drafted",
      entityType:"bridge_distribution_deal",entityId:id,
      metadata:{titleId:data.titleId,partnerId:data.partnerId,territories:data.territories,languages:data.languages}});
    return { dealId:id, status:"DRAFT" as const, deliveryStatus:"SPECIFICATION_PENDING" as const };
  });

const buyerEnquiryInput = z.object({
  titleId:z.string().min(8),
  territories:z.array(z.string().trim().min(2).max(80)).min(1).max(100),
  languages:z.array(z.string().trim().min(2).max(40)).min(1).max(20),
  media:z.array(z.string().trim().min(2).max(40)).min(1).max(20),
  notes:z.string().trim().min(8).max(2000),
});
export const createBuyerLicensingEnquiry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(buyerEnquiryInput)
  .handler(async ({context,data}) => {
    const actor=await verifiedActor(context.userId);
    if(actor.internalRole || actor.accountType!=="buyer") throw new Error("External Buyer account required");
    await assertBuyerPublishable(data.titleId);
    const id=randomUUID(), sql=await getSql();
    await sql`insert into bridge_distribution_deals
      (id,title_id,deal_type,buyer_user_id,territories,languages,media,status,
       notes,created_by,updated_by)
      values (${id},${data.titleId},'EXTERNAL_BUYER',${actor.userId},
      ${JSON.stringify(data.territories)}::jsonb,${JSON.stringify(data.languages)}::jsonb,
      ${JSON.stringify(data.media)}::jsonb,'ENQUIRY',${data.notes},${actor.userId},${actor.userId})`;
    await writeAudit({actorUserId:actor.userId,action:"licensing.buyer_enquiry_created",
      entityType:"bridge_distribution_deal",entityId:id,metadata:{titleId:data.titleId}});
    return { enquiryId:id,status:"ENQUIRY" as const };
  });

const transitionInput = z.object({
  dealId:z.string().uuid(),
  status:z.enum(["OFFERED","NEGOTIATION","AGREEMENT_PENDING","AGREEMENT_RECORDED","APPROVED","REJECTED","CANCELLED"]),
  agreementReference:z.string().trim().min(4).max(500).optional(),
  rightsGrantId:z.string().uuid().optional(),
  notes:z.string().trim().min(8).max(2000).optional(),
});
export const transitionLicensingDeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(transitionInput)
  .handler(async ({context,data}) => {
    const actor=await verifiedActor(context.userId);
    assertLicensingAdmin(actor);
    const sql=await getSql();
    const rows=await sql<{
      id:string;title_id:string;deal_type:string;partner_id:string|null;buyer_user_id:string|null;
      territories:unknown;languages:unknown;media:unknown;window_start:string|Date|null;
      window_end:string|Date|null;status:string;delivery_specs:unknown;
    }>`select id,title_id,deal_type,partner_id,buyer_user_id,territories,languages,media,
      window_start,window_end,status,delivery_specs from bridge_distribution_deals
      where id=${data.dealId}::uuid limit 1`;
    const deal=rows[0];
    if(!deal) throw new Error("Licensing deal not found");
    const allowed:Record<string,string[]> = {
      DRAFT:["OFFERED","CANCELLED"], ENQUIRY:["OFFERED","REJECTED","CANCELLED"],
      OFFERED:["NEGOTIATION","AGREEMENT_PENDING","REJECTED","CANCELLED"],
      NEGOTIATION:["OFFERED","AGREEMENT_PENDING","REJECTED","CANCELLED"],
      AGREEMENT_PENDING:["AGREEMENT_RECORDED","NEGOTIATION","REJECTED","CANCELLED"],
      AGREEMENT_RECORDED:["APPROVED","NEGOTIATION","REJECTED","CANCELLED"],
    };
    if(!(allowed[deal.status]||[]).includes(data.status)) throw new Error("Invalid licensing deal transition");
    let rightsGrantId=data.rightsGrantId||null;
    if(data.status==="AGREEMENT_RECORDED" && !data.agreementReference) throw new Error("Agreement reference is required");
    if(data.status==="APPROVED") {
      if(!data.agreementReference && !rightsGrantId) throw new Error("Recorded agreement and verified rights grant are required");
      if(!rightsGrantId) throw new Error("Select the VALID Bridge rights grant covering this deal");
      const grants=await sql<{id:string;territories:unknown;languages:unknown;media:unknown;window_start:string|Date|null;window_end:string|Date|null}>`select id,territories,languages,media,window_start,window_end
        from bridge_rights_grants where id=${rightsGrantId}::uuid and title_id=${deal.title_id}
        and status='VALID' limit 1`;
      const grant=grants[0];
      const includes=(source:unknown,requested:unknown)=>Array.isArray(source)&&Array.isArray(requested)&&requested.every(v=>source.map(x=>String(x).toUpperCase()).some(x=>["ALL","*","WORLDWIDE"].includes(x)||x===String(v).toUpperCase()));
      const gs=grant?.window_start?new Date(grant.window_start).getTime():Number.NEGATIVE_INFINITY;
      const ge=grant?.window_end?new Date(grant.window_end).getTime():Number.POSITIVE_INFINITY;
      const ds=deal.window_start?new Date(deal.window_start).getTime():Number.NEGATIVE_INFINITY;
      const de=deal.window_end?new Date(deal.window_end).getTime():Number.POSITIVE_INFINITY;
      if(!grant||!includes(grant.territories,deal.territories)||!includes(grant.languages,deal.languages)||!includes(grant.media,deal.media)||gs>ds||ge<de) {
        throw new Error("VALID rights grant does not cover this title, territory, language, media and full deal window");
      }
      const qc=await sql`select id from bridge_qc_cases where title_id=${deal.title_id} and status='PASSED'
        and reviewed_by is not null and reviewed_at is not null limit 1`;
      const legal=await sql`select id from bridge_legal_cases where title_id=${deal.title_id} and status='APPROVED'
        and reviewed_by is not null and reviewed_at is not null
        and evidence->0->>'grantId'=${rightsGrantId} limit 1`;
      if(!qc.length||!legal.length) throw new Error("Independent QC PASS and Legal approval for the selected grant are required");
      if(!data.agreementReference) throw new Error("Signed agreement reference is required before approval");
    }
    const nextNotes=data.notes||null;
    await sql`update bridge_distribution_deals set status=${data.status},
      agreement_reference=coalesce(${data.agreementReference||null},agreement_reference),
      rights_grant_id=coalesce(${rightsGrantId},rights_grant_id),
      notes=coalesce(${nextNotes},notes),updated_by=${actor.userId},
      reviewed_by=case when ${data.status}='APPROVED' then ${actor.userId} else reviewed_by end,
      reviewed_at=case when ${data.status}='APPROVED' then now() else reviewed_at end,
      updated_at=now() where id=${data.dealId}::uuid`;
    await writeAudit({actorUserId:actor.userId,action:"licensing.deal_transition",
      entityType:"bridge_distribution_deal",entityId:data.dealId,
      metadata:{from:deal.status,to:data.status,rightsGrantId,agreementReferenceRecorded:Boolean(data.agreementReference)}});
    return {dealId:data.dealId,status:data.status};
  });
