import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { sendBridgeMail } from "./mail.server";
import { signDownload } from "./oci-object-storage.server";

function assertBuyerOrInvestor(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (actor.accountType !== "buyer" && actor.accountType !== "investor") {
    throw new Error("Buyer or Investor account required");
  }
}

export const listBuyerLoopTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") assertBuyerOrInvestor(actor);
    assertPermission(actor, "buyer_loop.read");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select lt.id as loop_title_id,bt.id as bridge_title_id,lt.title,lt.synopsis,lt.language,lt.genres,lt.runtime_minutes,lt.release_year,lt.access_tier,lt.price_paise,lt.poster_url,lt.trailer_url,sc.id as story_concept_id,sc.logline,sc.synopsis as concept_synopsis,sc.genre as concept_genre,sc.estimated_budget_range,case when sc.id is null then false else exists(select 1 from bridge_buyer_interest bi where bi.concept_submission_id=sc.id and bi.buyer_user_id=$1) end as has_interest,case when sc.id is null then false else exists(select 1 from bridge_story_concept_mandates m join bridge_profiles p on p.organization_id=m.grantee_organization_id where p.user_id=$1 and m.grantee_organization_id=$2 and m.grantee_account_type=$3 and m.concept_submission_id=sc.id and m.grantee_account_type=p.account_type and m.grant_status='ACTIVE' and m.curation_status='BUYER_EVALUATION_APPROVED' and m.fee_certified_at is not null and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())) end as download_approved from loop_titles lt join bridge_titles bt on bt.id=lt.bridge_title_id join bridge_loop_publications pub on pub.loop_title_id=lt.id and pub.authorization_status='authorized' and pub.revoked_at is null and (pub.window_end is null or pub.window_end>now()) left join bridge_story_concept_submissions sc on sc.title_id=bt.id and sc.introduced_to_buyers_at is not null and sc.fee_certified_at is not null where lt.is_published=true and lt.is_listed=true and bt.status='LIVE_FOR_BUYERS' and lt.access_tier in ('FREE','AVOD') and public.bridge_title_buyer_visibility(bt.id)=true order by lt.release_year desc nulls last,lt.title asc",
      [actor.userId, actor.organizationId ?? null, actor.accountType],
    );
    return { titles: JSON.parse(JSON.stringify(rows)) };
  });

export const listViewerPublicTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "viewer") throw new Error("Viewer access required");
    assertPermission(actor, "title.read_published");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select lt.id as loop_title_id,bt.id as bridge_title_id,lt.title,lt.synopsis,lt.language,lt.genres,lt.runtime_minutes,lt.release_year,lt.poster_url,lt.trailer_url from loop_titles lt join bridge_titles bt on bt.id=lt.bridge_title_id join bridge_loop_publications pub on pub.loop_title_id=lt.id and pub.authorization_status='authorized' and pub.revoked_at is null and (pub.window_end is null or pub.window_end>now()) where lt.is_published=true and lt.is_listed=true and bt.status='LIVE_FOR_BUYERS' and public.bridge_title_buyer_visibility(bt.id)=true order by lt.release_year desc nulls last,lt.title asc",
    );
    return { titles: JSON.parse(JSON.stringify(rows)) };
  });

export const requestLoopTrailer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ loopTitleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole === "super_admin" || actor.internalRole === "viewer") {
      assertPermission(actor, "asset.read_trailer");
    } else {
      assertBuyerOrInvestor(actor);
      assertPermission(actor, "asset.read_trailer");
    }
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select lt.trailer_url,a.s3_key from loop_titles lt join bridge_titles bt on bt.id=lt.bridge_title_id join bridge_loop_publications pub on pub.loop_title_id=lt.id and pub.authorization_status='authorized' and pub.revoked_at is null and (pub.window_end is null or pub.window_end>now()) left join lateral (select s3_key from bridge_assets where title_id=bt.id and kind in ('trailer','screener') and byte_size>0 and length(checksum_sha256)=64 and storage_verified_at is not null order by case when kind='trailer' then 0 else 1 end,created_at desc limit 1) a on true where lt.id=$1 and lt.is_published=true and lt.is_listed=true and bt.status='LIVE_FOR_BUYERS' and public.bridge_title_buyer_visibility(bt.id)=true and ($2 <> 'viewer' or lt.access_tier in ('FREE','AVOD')) limit 1",
      [data.loopTitleId, actor.internalRole ?? actor.accountType],
    ) as Array<{ trailer_url: string | null; s3_key: string | null }>;
    const row = rows[0];
    if (!row) throw new Error("Published trailer not found");
    if (row.trailer_url) return { url: row.trailer_url, expiresInSeconds: null };
    if (!row.s3_key) throw new Error("No verified trailer is available");
    return { ...(await signDownload({ key: row.s3_key })), expiresInSeconds: 300 };
  });

export const createInvestmentInterest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ conceptSubmissionId: z.string().uuid(), notes: z.string().trim().max(1000).optional() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertBuyerOrInvestor(actor);
    assertPermission(actor, "buyer.investment_interest");
    const sql = await getSql();
    const eligible = await sql.unsafe(
      "select sc.id,bt.name as title_name from bridge_story_concept_submissions sc join bridge_titles bt on bt.id=sc.title_id join loop_titles lt on lt.bridge_title_id=bt.id and lt.is_published=true and lt.is_listed=true join bridge_loop_publications pub on pub.loop_title_id=lt.id and pub.authorization_status='authorized' and pub.revoked_at is null and (pub.window_end is null or pub.window_end>now()) where sc.id=$1 and sc.introduced_to_buyers_at is not null and sc.fee_certified_at is not null and bt.status='LIVE_FOR_BUYERS' and public.bridge_title_buyer_visibility(bt.id)=true limit 1",
      [data.conceptSubmissionId],
    ) as Array<{ id: string; title_name: string }>;
    if (!eligible[0]) throw new Error("Investment interest is available only for an introduced, published Story Concept");
    const saved = await sql.transaction(async (tx) => {
      await tx.unsafe("select pg_advisory_xact_lock(hashtext($1),hashtext($2))", [actor.userId, data.conceptSubmissionId]);
      const existing = await tx.unsafe(
        "select id::text from bridge_buyer_interest where concept_submission_id=$1 and buyer_user_id=$2 limit 1",
        [data.conceptSubmissionId, actor.userId],
      ) as Array<{ id: string }>;
      if (existing[0]) return { interestId: existing[0].id, created: false };
      const inserted = await tx.unsafe(
        "insert into bridge_buyer_interest (concept_submission_id,buyer_user_id,interest_level,notes) values ($1,$2,'INTERESTED',$3) returning id::text",
        [data.conceptSubmissionId, actor.userId, data.notes ?? null],
      ) as Array<{ id: string }>;
      if (!inserted[0]) throw new Error("Investment interest could not be recorded");
      return { interestId: inserted[0].id, created: true };
    });
    if (!saved.created) {
      const prior = await sql.unsafe(
        "select case when action='email.delivery.sent' then 'SENT' else 'FAILED' end as status from bridge_audit_logs where entity_type='bridge_buyer_interest' and entity_id=$1 and action in ('email.delivery.sent','email.delivery.failed') order by created_at desc limit 1",
        [saved.interestId],
      ) as Array<{ status: "SENT" | "FAILED" }>;
      return { interestId: saved.interestId, alreadySubmitted: true, emailDelivery: { status: prior[0]?.status ?? "NOT_SENT", failure: null } };
    }
    await writeAudit({
      actorUserId: actor.userId, action: "buyer.investment_interest.create",
      entityType: "bridge_buyer_interest", entityId: saved.interestId,
      metadata: { conceptSubmissionId: data.conceptSubmissionId, titleName: eligible[0].title_name },
    });
    let emailStatus: "SENT" | "FAILED" = "FAILED";
    let emailFailure: string | null = null;
    try {
      const result = await sendBridgeMail({
        to: "admin@crayonspictures.in",
        subject: "New investment interest: " + eligible[0].title_name,
        text: "A Buyer/Investor submitted investment interest for " + eligible[0].title_name + ". Review the interest in Crayons Bridge.",
      });
      emailStatus = result.ok ? "SENT" : "FAILED";
    } catch (error) {
      emailFailure = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed";
    }
    try {
      await writeAudit({
        actorUserId: actor.userId,
        action: emailStatus === "SENT" ? "email.delivery.sent" : "email.delivery.failed",
        entityType: "bridge_buyer_interest", entityId: saved.interestId,
        metadata: { category: "investment_interest", recipient: "admin@crayonspictures.in", status: emailStatus, failure: emailFailure },
      });
    } catch (error) {
      console.error("[bridge-investment-interest] email status audit failed", error);
    }
    return { interestId: saved.interestId, alreadySubmitted: false, emailDelivery: { status: emailStatus, failure: emailFailure } };
  });

export const listStoryConceptApprovalQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    assertPermission(actor, "story_concept.final_approve");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select sc.id,sc.title_id,bt.name as title_name,sc.logline,sc.legal_status,sc.editorial_status,sc.fee_certified_at,sc.introduced_to_buyers_at from bridge_story_concept_submissions sc join bridge_titles bt on bt.id=sc.title_id where sc.fee_certified_at is not null and sc.legal_status='APPROVED' and sc.editorial_status='APPROVED' and sc.introduced_to_buyers_at is null order by sc.created_at asc",
    );
    return { queue: JSON.parse(JSON.stringify(rows)) };
  });

export const approveStoryConceptForBuyerView = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ conceptSubmissionId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    assertPermission(actor, "story_concept.final_approve");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "update bridge_story_concept_submissions set curation_status='INTRODUCED_TO_BUYERS',introduced_to_buyers_at=now(),updated_at=now() where id=$1 and fee_certified_at is not null and legal_status='APPROVED' and editorial_status='APPROVED' and introduced_to_buyers_at is null returning id::text,title_id",
      [data.conceptSubmissionId],
    ) as Array<{ id: string; title_id: string }>;
    if (!rows[0]) throw new Error("Story Concept is not paid, legally/editorially approved, or is already introduced");
    await writeAudit({
      actorUserId: actor.userId, action: "story_concept.final_approve",
      entityType: "bridge_story_concept_submission", entityId: rows[0].id,
      metadata: { titleId: rows[0].title_id, introducedToBuyers: true },
    });
    return { approved: true, conceptSubmissionId: rows[0].id };
  });

export const listBuyerOrganizations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    assertPermission(actor, "legacy.map");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select id::text,legal_name from bridge_organizations where status='active' order by legal_name",
    );
    return { organizations: rows };
  });

export const approveStoryConceptDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    conceptSubmissionId: z.string().uuid(),
    organizationId: z.string().uuid(),
    accountType: z.enum(["buyer","investor"]),
    expiresAt: z.string().datetime().optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    assertPermission(actor, "story_concept.download_approved");
    const sql = await getSql();
    const org = await sql.unsafe(
      "select id from bridge_organizations where id=$1 and status='active' limit 1",
      [data.organizationId],
    );
    if (!org[0]) throw new Error("Active Buyer/Investor organization not found");
    if (data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()) throw new Error("Download approval expiry must be in the future");
    const eligible = await sql.unsafe(
      "select id from bridge_story_concept_submissions where id=$1 and fee_certified_at is not null and introduced_to_buyers_at is not null and treatment_object_key is not null limit 1",
      [data.conceptSubmissionId],
    );
    if (!eligible[0]) throw new Error("Only a paid Story Concept already introduced to buyers can receive download approval");
    const rows = await sql.unsafe(
      "insert into bridge_story_concept_mandates (concept_submission_id,grantee_organization_id,grantee_account_type,grant_status,curation_status,fee_certified_at,expires_at,created_by) values ($1,$2,$3,'ACTIVE','BUYER_EVALUATION_APPROVED',now(),$4,$5) returning id::text",
      [data.conceptSubmissionId, data.organizationId, data.accountType, data.expiresAt ?? null, actor.userId],
    ) as Array<{ id: string }>;
    await writeAudit({
      actorUserId: actor.userId, action: "story_concept.download_approve",
      entityType: "bridge_story_concept_submission", entityId: data.conceptSubmissionId,
      metadata: { mandateId: rows[0]?.id, organizationId: data.organizationId, accountType: data.accountType, expiresAt: data.expiresAt ?? null },
    });
    return { approved: true, mandateId: rows[0]?.id };
  });

export const requestStoryConceptDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ conceptSubmissionId: z.string().uuid(), asset: z.enum(["treatment","screenplay"]) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertBuyerOrInvestor(actor);
    assertPermission(actor, "story_concept.read_buyer");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select case when $1='treatment' then sc.treatment_object_key else sc.screenplay_object_key end as object_key from bridge_story_concept_submissions sc join bridge_titles bt on bt.id=sc.title_id join loop_titles lt on lt.bridge_title_id=bt.id and lt.is_published=true and lt.is_listed=true join bridge_loop_publications pub on pub.loop_title_id=lt.id and pub.authorization_status='authorized' and pub.revoked_at is null and (pub.window_end is null or pub.window_end>now()) join bridge_story_concept_mandates m on m.concept_submission_id=sc.id and m.grantee_organization_id=$2 and m.grantee_account_type=$3 and m.grant_status='ACTIVE' and m.curation_status='BUYER_EVALUATION_APPROVED' and m.fee_certified_at is not null and m.revoked_at is null and (m.expires_at is null or m.expires_at>now()) where sc.id=$4 and sc.introduced_to_buyers_at is not null and sc.fee_certified_at is not null and bt.status='LIVE_FOR_BUYERS' and public.bridge_title_buyer_visibility(bt.id)=true limit 1",
      [data.asset, actor.organizationId ?? null, actor.accountType, data.conceptSubmissionId],
    ) as Array<{ object_key: string | null }>;
    if (!rows[0]?.object_key) throw new Error("Story Concept download denied: Super Admin approval for your organization is required");
    return signDownload({ key: rows[0].object_key });
  });

export const listLegacyBuyerMappingEvidence = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    assertPermission(actor, "legacy.map");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select l.source_table,l.legacy_id::text,l.order_id,l.bridge_title_id,t.name as title_name,l.review_status,l.reviewed_at,coalesce(to_jsonb(l)->>'buyer_name',to_jsonb(l)->>'buyer_account_name',to_jsonb(l)->>'buyer_organization_name') as buyer_name,coalesce(to_jsonb(l)->>'buyer_user_id',to_jsonb(l)->>'legacy_buyer_user_id') as buyer_user_id,coalesce(to_jsonb(l)->>'evidence_type',to_jsonb(l)->>'contract_type') as evidence_type,coalesce(to_jsonb(l)->>'evidence_reference',to_jsonb(l)->>'contract_reference') as evidence_reference,exists(select 1 from bridge_buyer_title_access a where a.title_id=l.bridge_title_id and a.buyer_user_id=coalesce(to_jsonb(l)->>'buyer_user_id',to_jsonb(l)->>'legacy_buyer_user_id') and a.revoked_at is null) as mapped from streamvista_legacy_links l left join bridge_titles t on t.id=l.bridge_title_id where lower(coalesce(t.name,'')) like any(array['%jananam%','%pranaayam%','%pranayam%','%1947%']) order by t.name,l.source_table,l.legacy_id",
    );
    return { evidence: JSON.parse(JSON.stringify(rows)) };
  });

export const mapLegacyBuyer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ sourceTable: z.string().min(1).max(100), legacyId: z.string().min(1).max(100) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    assertPermission(actor, "legacy.map");
    const sql = await getSql();
    const links = await sql.unsafe(
      "select l.bridge_title_id as title_id,l.review_status,coalesce(to_jsonb(l)->>'buyer_name',to_jsonb(l)->>'buyer_account_name',to_jsonb(l)->>'buyer_organization_name') as buyer_name,coalesce(to_jsonb(l)->>'buyer_user_id',to_jsonb(l)->>'legacy_buyer_user_id') as buyer_user_id,coalesce(to_jsonb(l)->>'evidence_type',to_jsonb(l)->>'contract_type') as evidence_type,coalesce(to_jsonb(l)->>'evidence_reference',to_jsonb(l)->>'contract_reference') as evidence_reference from streamvista_legacy_links l where l.source_table=$1 and l.legacy_id::text=$2 limit 1",
      [data.sourceTable, data.legacyId],
    ) as Array<{ title_id: string; review_status: string; buyer_name: string | null; buyer_user_id: string | null; evidence_type: string | null; evidence_reference: string | null }>;
    const link = links[0];
    if (!link || !link.buyer_user_id || !link.buyer_name || !["bookmyshow","sun nxt"].includes(link.buyer_name.toLowerCase()) || !link.evidence_reference ||
        !["SIGNED_CONTRACT","PURCHASE_ORDER","PAYMENT_RECEIPT"].includes(String(link.evidence_type).toUpperCase()) ||
        !["VERIFIED","APPROVED"].includes(link.review_status.toUpperCase())) {
      throw new Error("Mapping blocked: verified buyer identity and contract/order/payment evidence are missing");
    }
    const buyer = await sql.unsafe(
      "select p.user_id from bridge_profiles p join bridge_organization_memberships m on m.user_id=p.user_id and m.organization_id=p.organization_id and m.status='active' join bridge_organizations o on o.id=m.organization_id and o.status='active' where p.user_id=$1 and p.account_type in ('buyer','investor') and lower(o.legal_name)=lower($2) limit 1",
      [link.buyer_user_id, link.buyer_name],
    ) as Array<{ user_id: string }>;
    if (!buyer[0]) throw new Error("Mapping blocked: no matching Buyer/Investor Bridge account for the evidenced legacy buyer");
    const existing = await sql.unsafe(
      "select id::text from bridge_buyer_title_access where title_id=$1 and buyer_user_id=$2 and revoked_at is null limit 1",
      [link.title_id, buyer[0].user_id],
    ) as Array<{ id: string }>;
    if (existing[0]) return { mapped: true, accessId: existing[0].id, alreadyMapped: true };
    const inserted = await sql.unsafe(
      "insert into bridge_buyer_title_access (title_id,buyer_user_id,granted_by,granted_at) values ($1,$2,$3,now()) returning id::text",
      [link.title_id, buyer[0].user_id, actor.userId],
    ) as Array<{ id: string }>;
    if (!inserted[0]) throw new Error("Buyer mapping was not persisted");
    await writeAudit({
      actorUserId: actor.userId, action: "legacy.buyer_mapping.create",
      entityType: "bridge_buyer_title_access", entityId: inserted[0].id,
      metadata: { sourceTable: data.sourceTable, legacyId: data.legacyId, titleId: link.title_id, buyerName: link.buyer_name, evidenceType: link.evidence_type, evidenceReference: link.evidence_reference },
    });
    return { mapped: true, accessId: inserted[0].id, alreadyMapped: false };
  });


export const listInvestmentInterestActivity = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    assertPermission(actor, "buyer.read");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select bi.id::text,bt.name as title_name,bi.interest_level,bi.created_at,p.display_name as buyer_name,p.email as buyer_email,p.account_type,(select case when a.action='email.delivery.sent' then 'SENT' else 'FAILED' end from bridge_audit_logs a where a.entity_type='bridge_buyer_interest' and a.entity_id=bi.id::text and a.action in ('email.delivery.sent','email.delivery.failed') order by a.created_at desc limit 1) as email_status from bridge_buyer_interest bi join bridge_story_concept_submissions sc on sc.id=bi.concept_submission_id join bridge_titles bt on bt.id=sc.title_id left join bridge_profiles p on p.user_id=bi.buyer_user_id order by bi.created_at desc limit 100",
    );
    return { activity: JSON.parse(JSON.stringify(rows)) };
  });
