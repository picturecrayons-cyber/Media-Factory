/**
 * Story / Concept network access, interest and readiness APIs.
 * All mandate and interest data remains server-only; callers are authenticated
 * through Bridge identity and checked against active organization membership.
 */
import { createServerFn } from "@tanstack/react-start";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

function requireSuperAdmin(actor: { internalRole?: string | null; emailVerified?: boolean }) {
  if (!actor.emailVerified || actor.internalRole !== "super_admin") {
    throw new Error("Super Admin access required");
  }
}

async function requireNetworkOrganization(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  accountType: "buyer" | "investor",
): Promise<string> {
  const rows = await sql<{ organization_id: string }>`
    select o.id as organization_id
    from bridge_profiles bp
    join bridge_organization_memberships m
      on m.user_id = bp.user_id
     and m.organization_id = bp.organization_id
     and m.status = 'active'
    join bridge_organizations o
      on o.id = m.organization_id
     and lower(o.status) = 'active'
    where bp.user_id = ${userId}
      and bp.account_type = ${accountType}
      and bp.email_verified = true
      and bp.organization_id is not null
    limit 1
  `;
  if (!rows[0]) throw new Error("An active, verified Buyer / Investor organization membership is required");
  return rows[0].organization_id;
}

const conceptIdSchema = z.object({ conceptSubmissionId: z.string().uuid() });

/** Super Admin: list verified active Buyer and Investor organizations eligible for introduction. */
export const listStoryConceptNetworkOrganizations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor);
    const sql = await getSql();
    const rows = await sql<{
      organization_id: string;
      organization_name: string;
      account_type: "buyer" | "investor";
      verified_member_count: number;
    }>`
      select o.id as organization_id, o.legal_name as organization_name,
             bp.account_type,
             count(distinct bp.user_id)::int as verified_member_count
      from bridge_organizations o
      join bridge_organization_memberships m
        on m.organization_id = o.id and m.status = 'active'
      join bridge_profiles bp
        on bp.user_id = m.user_id
       and bp.organization_id = m.organization_id
       and bp.email_verified = true
       and bp.account_type in ('buyer','investor')
      where lower(o.status) = 'active'
      group by o.id, o.legal_name, bp.account_type
      order by o.legal_name, bp.account_type
    `;
    return { organizations: rows };
  });

/** Super Admin: grant a verified Buyer or Investor organization time-bounded concept access. */
export const grantStoryConceptNetworkAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    conceptSubmissionId: z.string().uuid(),
    organizationId: z.string().uuid(),
    accountType: z.enum(["buyer", "investor"]),
    expiresAt: z.string().datetime().optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const concept = await tx<{ id: string }>`
        select c.id
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where c.id = ${data.conceptSubmissionId}
          and c.curation_status = 'APPROVED'
          and t.submission_type = 'story_concept'
          and t.record_classification is distinct from 'TEST'
          and coalesce(t.external_ids->>'test_only', 'false') <> 'true'
        limit 1
      `;
      if (!concept[0]) throw new Error("Concept must pass curation before network introduction");
      const eligible = await tx<{ organization_id: string }>`
        select o.id as organization_id
        from bridge_organizations o
        join bridge_organization_memberships m on m.organization_id = o.id and m.status = 'active'
        join bridge_profiles bp on bp.user_id = m.user_id
          and bp.organization_id = m.organization_id
          and bp.account_type = ${data.accountType}
          and bp.email_verified = true
        where o.id = ${data.organizationId}::uuid and lower(o.status) = 'active'
        limit 1
      `;
      if (!eligible[0]) throw new Error("Selected organization has no verified active account of the requested type");
      const rows = await tx<{ id: string; grant_status: string }>`
        insert into bridge_story_concept_mandates (
          concept_submission_id, grantee_organization_id, grantee_account_type,
          grant_status, curation_status, expires_at, revoked_at, created_by, updated_at
        ) values (
          ${data.conceptSubmissionId}::uuid, ${data.organizationId}::uuid, ${data.accountType},
          'ACTIVE', 'BUYER_EVALUATION_APPROVED', ${data.expiresAt ?? null}::timestamptz,
          null, ${actor.userId}, now()
        )
        on conflict (concept_submission_id, grantee_organization_id, grantee_account_type)
        do update set grant_status = 'ACTIVE',
          curation_status = 'BUYER_EVALUATION_APPROVED',
          expires_at = excluded.expires_at, revoked_at = null,
          created_by = excluded.created_by, updated_at = now()
        returning id, grant_status
      `;
      const grant = rows[0];
      if (!grant) throw new Error("Network access grant was not created");
      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.network_access_granted",
        entityType: "bridge_story_concept_mandate",
        entityId: grant.id,
        metadata: {
          conceptSubmissionId: data.conceptSubmissionId,
          organizationId: data.organizationId,
          accountType: data.accountType,
          expiresAt: data.expiresAt ?? null,
        },
      }, tx);
      return { grant };
    });
  });

/** Super Admin: revoke an existing organization-level introduction. */
export const revokeStoryConceptNetworkAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ mandateId: z.string().uuid(), reason: z.string().min(3).max(1000) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const rows = await tx<{ id: string; concept_submission_id: string; grantee_organization_id: string; grantee_account_type: string }>`
        update bridge_story_concept_mandates
        set grant_status = 'REVOKED', revoked_at = now(), updated_at = now()
        where id = ${data.mandateId}::uuid and grant_status = 'ACTIVE' and revoked_at is null
        returning id, concept_submission_id, grantee_organization_id, grantee_account_type
      `;
      const grant = rows[0];
      if (!grant) throw new Error("Active network grant not found");
      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.network_access_revoked",
        entityType: "bridge_story_concept_mandate",
        entityId: grant.id,
        metadata: { ...grant, reason: data.reason },
      }, tx);
      return { revoked: true };
    });
  });

/** Buyer / Investor: return only concepts granted to the caller's active organization. */
export const listMyIntroducedStoryConcepts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["buyer", "investor"].includes(actor.accountType)) {
      throw new Error("Buyer or Investor account required");
    }
    const accountType = actor.accountType as "buyer" | "investor";
    const sql = await getSql();
    const organizationId = await requireNetworkOrganization(sql, actor.userId, accountType);
    const rows = await sql<{
      concept_submission_id: string;
      title_id: string;
      title_name: string;
      language: string;
      logline: string | null;
      synopsis: string | null;
      genre: string[] | null;
      estimated_budget_range: string | null;
      target_platforms: string[] | null;
      mandate_id: string;
      expires_at: string | null;
    }>`
      select c.id as concept_submission_id, t.id as title_id, t.name as title_name,
             t.language, c.logline, c.synopsis, c.genre, c.estimated_budget_range,
             c.target_platforms, m.id as mandate_id, m.expires_at
      from bridge_story_concept_mandates m
      join bridge_story_concept_submissions c on c.id = m.concept_submission_id
      join bridge_titles t on t.id = c.title_id
      join bridge_organization_memberships om on om.organization_id = m.grantee_organization_id
        and om.user_id = ${actor.userId} and om.status = 'active'
      join bridge_organizations o on o.id = m.grantee_organization_id and lower(o.status) = 'active'
      where m.grantee_organization_id = ${organizationId}::uuid
        and m.grantee_account_type = ${accountType}
        and m.grant_status = 'ACTIVE' and m.revoked_at is null
        and (m.expires_at is null or m.expires_at > now())
        and c.curation_status = 'APPROVED'
        and t.submission_type = 'story_concept'
        and t.record_classification is distinct from 'TEST'
        and coalesce(t.external_ids->>'test_only', 'false') <> 'true'
      order by m.created_at desc
    `;
    return { concepts: rows };
  });

/** Buyer / Investor: record an append-only interest event against an active introduction. */
export const recordStoryConceptInterest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    conceptSubmissionId: z.string().uuid(),
    interestLevel: z.enum(["INTERESTED", "REQUESTED_MATERIALS", "PASSED"]),
    notes: z.string().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["buyer", "investor"].includes(actor.accountType)) {
      throw new Error("Buyer or Investor account required");
    }
    const accountType = actor.accountType as "buyer" | "investor";
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const organizationId = await requireNetworkOrganization(tx, actor.userId, accountType);
      const grant = await tx<{ id: string }>`
        select m.id
        from bridge_story_concept_mandates m
        join bridge_story_concept_submissions c on c.id = m.concept_submission_id
        join bridge_titles t on t.id = c.title_id
        where m.concept_submission_id = ${data.conceptSubmissionId}::uuid
          and m.grantee_organization_id = ${organizationId}::uuid
          and m.grantee_account_type = ${accountType}
          and m.grant_status = 'ACTIVE' and m.revoked_at is null
          and (m.expires_at is null or m.expires_at > now())
          and c.curation_status = 'APPROVED'
          and t.submission_type = 'story_concept'
          and t.record_classification is distinct from 'TEST'
          and coalesce(t.external_ids->>'test_only', 'false') <> 'true'
        limit 1
      `;
      if (!grant[0]) throw new Error("No active introduction exists for this concept");
      const rows = await tx<{ id: string; created_at: string }>`
        insert into bridge_story_concept_interest_events (
          concept_submission_id, account_type, actor_user_id, organization_id, interest_level, notes
        ) values (
          ${data.conceptSubmissionId}::uuid, ${accountType}, ${actor.userId},
          ${organizationId}::uuid, ${data.interestLevel}, ${data.notes ?? null}
        )
        returning id, created_at
      `;
      const event = rows[0];
      if (!event) throw new Error("Interest event was not recorded");
      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.network_interest_recorded",
        entityType: "bridge_story_concept_interest_event",
        entityId: event.id,
        metadata: { conceptSubmissionId: data.conceptSubmissionId, organizationId, accountType, interestLevel: data.interestLevel },
      }, tx);
      return { event };
    });
  });

/** Super Admin: inspect interest history and current readiness gate for a concept. */
export const getStoryConceptNetworkReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(conceptIdSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor);
    const sql = await getSql();
    const interest = await sql<{
      account_type: string;
      organization_id: string;
      organization_name: string;
      interest_level: string;
      notes: string | null;
      created_at: string;
      actor_user_id: string;
    }>`
      select e.account_type, e.organization_id, o.legal_name as organization_name, e.interest_level,
             e.notes, e.created_at, e.actor_user_id
      from bridge_story_concept_interest_events e
      join bridge_organizations o on o.id = e.organization_id
      where e.concept_submission_id = ${data.conceptSubmissionId}::uuid
      order by e.created_at desc
      limit 200
    `;
    const readiness = await sql<{
      readiness_status: string;
      qualifying_interest_count: number;
      buyer_interest_count: number;
      investor_interest_count: number;
      reviewed_by: string | null;
      reviewed_at: string | null;
      review_notes: string | null;
      production_organization_id: string | null;
      production_project_id: string | null;
      finished_film_title_id: string | null;
      handed_off_at: string | null;
    }>`
      select readiness_status, qualifying_interest_count, buyer_interest_count,
             investor_interest_count, reviewed_by, reviewed_at, review_notes,
             production_organization_id, production_project_id, finished_film_title_id, handed_off_at
      from bridge_story_concept_readiness_reviews
      where concept_submission_id = ${data.conceptSubmissionId}::uuid
      limit 1
    `;
    const mandates = await sql<{
      id: string;
      grantee_organization_id: string;
      organization_name: string;
      grantee_account_type: string;
      grant_status: string;
      expires_at: string | null;
    }>`
      select m.id, m.grantee_organization_id, o.legal_name as organization_name,
             m.grantee_account_type, m.grant_status, m.expires_at
      from bridge_story_concept_mandates m
      join bridge_organizations o on o.id = m.grantee_organization_id
      where m.concept_submission_id = ${data.conceptSubmissionId}::uuid
      order by m.created_at desc
    `;
    return { interest, readiness: readiness[0] ?? null, mandates };
  });

/** Super Admin: approve readiness only when the latest response from an introduced org is positive. */
export const reviewStoryConceptReadiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    conceptSubmissionId: z.string().uuid(),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reviewNotes: z.string().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const concept = await tx<{ id: string }>`
        select c.id
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where c.id = ${data.conceptSubmissionId}::uuid
          and c.curation_status = 'APPROVED'
          and t.submission_type = 'story_concept'
          and t.record_classification is distinct from 'TEST'
          and coalesce(t.external_ids->>'test_only', 'false') <> 'true'
        limit 1
      `;
      if (!concept[0]) throw new Error("Concept must be approved by curation before readiness review");
      const counts = await tx<{
        qualifying_interest_count: number;
        buyer_interest_count: number;
        investor_interest_count: number;
      }>`
        with latest as (
          select distinct on (e.organization_id, e.account_type)
            e.organization_id, e.account_type, e.interest_level
          from bridge_story_concept_interest_events e
          join bridge_story_concept_mandates m
            on m.concept_submission_id = e.concept_submission_id
           and m.grantee_organization_id = e.organization_id
           and m.grantee_account_type = e.account_type
           and m.grant_status = 'ACTIVE' and m.revoked_at is null
           and (m.expires_at is null or m.expires_at > now())
          join bridge_profiles bp
            on bp.user_id = e.actor_user_id
           and bp.organization_id = e.organization_id
           and bp.account_type = e.account_type
           and bp.email_verified = true
          join bridge_organization_memberships om
            on om.user_id = e.actor_user_id
           and om.organization_id = e.organization_id
           and om.status = 'active'
          join bridge_organizations o
            on o.id = e.organization_id and lower(o.status) = 'active'
          where e.concept_submission_id = ${data.conceptSubmissionId}::uuid
          order by e.organization_id, e.account_type, e.created_at desc
        )
        select
          count(*) filter (where interest_level in ('INTERESTED','REQUESTED_MATERIALS'))::int as qualifying_interest_count,
          count(*) filter (where account_type = 'buyer' and interest_level in ('INTERESTED','REQUESTED_MATERIALS'))::int as buyer_interest_count,
          count(*) filter (where account_type = 'investor' and interest_level in ('INTERESTED','REQUESTED_MATERIALS'))::int as investor_interest_count
        from latest
      `;
      const summary = counts[0];
      if (!summary) throw new Error("Unable to calculate network interest");
      if (data.decision === "APPROVED" && summary.qualifying_interest_count < 1) {
        throw new Error("Readiness cannot be approved without current positive interest from an introduced Buyer or Investor organization");
      }
      const rows = await tx<{ readiness_status: string }>`
        insert into bridge_story_concept_readiness_reviews (
          concept_submission_id, readiness_status, reviewed_by, reviewed_at, review_notes,
          qualifying_interest_count, buyer_interest_count, investor_interest_count, updated_at
        ) values (
          ${data.conceptSubmissionId}::uuid, ${data.decision}, ${actor.userId}, now(),
          ${data.reviewNotes ?? null}, ${summary.qualifying_interest_count},
          ${summary.buyer_interest_count}, ${summary.investor_interest_count}, now()
        )
        on conflict (concept_submission_id) do update set
          readiness_status = excluded.readiness_status,
          reviewed_by = excluded.reviewed_by,
          reviewed_at = excluded.reviewed_at,
          review_notes = excluded.review_notes,
          qualifying_interest_count = excluded.qualifying_interest_count,
          buyer_interest_count = excluded.buyer_interest_count,
          investor_interest_count = excluded.investor_interest_count,
          updated_at = now()
        returning readiness_status
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.readiness_reviewed",
        entityType: "bridge_story_concept_readiness_review",
        entityId: data.conceptSubmissionId,
        metadata: { decision: data.decision, ...summary, reviewNotes: data.reviewNotes ?? null },
      }, tx);
      return { readiness: rows[0] };
    });
  });


/** Super Admin: list active Studio organizations eligible to receive a Production project. */
export const listStoryConceptProductionOrganizations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor);
    const sql = await getSql();
    const organizations = await sql<{
      organization_id: string;
      organization_name: string;
      verified_member_count: number;
    }>`
      select o.id as organization_id, o.legal_name as organization_name,
             count(distinct bp.user_id)::int as verified_member_count
      from bridge_organizations o
      join bridge_organization_memberships m
        on m.organization_id = o.id and m.status = 'active'
      join bridge_profiles bp
        on bp.user_id = m.user_id
       and bp.organization_id = m.organization_id
       and bp.account_type = 'studio'
       and bp.email_verified = true
      where lower(o.status) = 'active'
      group by o.id, o.legal_name
      order by o.legal_name
    `;
    return { organizations };
  });

function productionSlug(name: string, id: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${base || "finished-film"}-${id.slice(0, 8)}`;
}

/**
 * Super Admin: create a Production project and a separate Finished Film draft
 * only after readiness is approved. The original Story / Concept remains intact.
 */
export const handoffStoryConceptToProduction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    conceptSubmissionId: z.string().uuid(),
    productionOrganizationId: z.string().uuid(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireSuperAdmin(actor);
    const sql = await getSql();

    return sql.transaction(async (tx) => {
      const sources = await tx<{
        concept_id: string;
        title_id: string;
        title_name: string;
        title_synopsis: string;
        language: string;
        content_type: string;
        owner_user_id: string;
        owner_account_type: string;
        owner_organization_id: string | null;
      }>`
        select c.id as concept_id, t.id as title_id, t.name as title_name,
               t.synopsis as title_synopsis, t.language, t.content_type,
               t.owner_user_id, t.owner_account_type, t.owner_organization_id
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where c.id = ${data.conceptSubmissionId}::uuid
          and c.curation_status = 'APPROVED'
          and t.submission_type = 'story_concept'
          and t.record_classification is distinct from 'TEST'
          and coalesce(t.external_ids->>'test_only', 'false') <> 'true'
        for update of c, t
      `;
      const source = sources[0];
      if (!source) throw new Error("Approved Story / Concept source was not found");

      const reviews = await tx<{
        id: string;
        readiness_status: string;
      }>`
        select id, readiness_status
        from bridge_story_concept_readiness_reviews
        where concept_submission_id = ${data.conceptSubmissionId}::uuid
        for update
      `;
      const review = reviews[0];
      if (!review || review.readiness_status !== "APPROVED") {
        throw new Error("Production handoff requires an approved readiness review");
      }

      const positive = await tx<{ qualifying_interest_count: number }>`
        with latest as (
          select distinct on (e.organization_id, e.account_type)
            e.organization_id, e.account_type, e.interest_level
          from bridge_story_concept_interest_events e
          join bridge_story_concept_mandates m
            on m.concept_submission_id = e.concept_submission_id
           and m.grantee_organization_id = e.organization_id
           and m.grantee_account_type = e.account_type
           and m.grant_status = 'ACTIVE' and m.revoked_at is null
           and (m.expires_at is null or m.expires_at > now())
          join bridge_profiles bp
            on bp.user_id = e.actor_user_id
           and bp.organization_id = e.organization_id
           and bp.account_type = e.account_type
           and bp.email_verified = true
          join bridge_organization_memberships om
            on om.user_id = e.actor_user_id
           and om.organization_id = e.organization_id
           and om.status = 'active'
          join bridge_organizations o
            on o.id = e.organization_id and lower(o.status) = 'active'
          where e.concept_submission_id = ${data.conceptSubmissionId}::uuid
          order by e.organization_id, e.account_type, e.created_at desc
        )
        select count(*) filter (where interest_level in ('INTERESTED','REQUESTED_MATERIALS'))::int
          as qualifying_interest_count
        from latest
      `;
      if (!positive[0] || positive[0].qualifying_interest_count < 1) {
        throw new Error("Production handoff is blocked: current positive Buyer / Investor interest is no longer verified");
      }

      const productionOrg = await tx<{ id: string }>`
        select o.id
        from bridge_organizations o
        join bridge_organization_memberships m
          on m.organization_id = o.id and m.status = 'active'
        join bridge_profiles bp
          on bp.user_id = m.user_id
         and bp.organization_id = m.organization_id
         and bp.account_type = 'studio'
         and bp.email_verified = true
        where o.id = ${data.productionOrganizationId}::uuid
          and lower(o.status) = 'active'
        limit 1
      `;
      if (!productionOrg[0]) throw new Error("Select an active Studio organization with a verified member");

      const existingHandoff = await tx<{ id: string }>`
        select id from bridge_production_title_links
        where title_id = ${source.title_id}
          and link_type = 'STORY_CONCEPT_SOURCE'
        limit 1
      `;
      if (existingHandoff[0]) throw new Error("This Story / Concept has already been handed off to Production");

      const projectId = randomUUID();
      const outputTitleId = randomBytes(16).toString("hex");
      const productionType = ["FEATURE", "SHORT", "SERIES", "DOCUMENTARY"].includes(source.content_type.toUpperCase())
        ? source.content_type.toUpperCase()
        : "OTHER";
      const projectCode = `SC-${source.concept_id.slice(0, 6).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;

      await tx`
        insert into bridge_production_projects (
          id, organization_id, name, project_code, production_type, status, created_by, updated_by
        ) values (
          ${projectId}::uuid, ${data.productionOrganizationId}::uuid, ${source.title_name},
          ${projectCode}, ${productionType}, 'PRE_PRODUCTION', ${actor.userId}, ${actor.userId}
        )
      `;

      await tx`
        insert into bridge_titles (
          id, slug, name, owner_user_id, owner_account_type, status, synopsis, language,
          content_type, owner_organization_id, submission_type
        ) values (
          ${outputTitleId}, ${productionSlug(source.title_name, outputTitleId)}, ${source.title_name},
          ${source.owner_user_id}, ${source.owner_account_type}, 'DRAFT', ${source.title_synopsis},
          ${source.language}, ${source.content_type}, ${source.owner_organization_id}, 'finished_film'
        )
      `;

      await tx`
        insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
        values (
          ${outputTitleId}, null, 'DRAFT', ${actor.userId},
          'finished film draft created by authorized Story / Concept Production handoff'
        )
      `;

      await tx`
        insert into bridge_production_title_links (
          production_project_id, title_id, link_type, created_by
        ) values (
          ${projectId}::uuid, ${source.title_id}, 'STORY_CONCEPT_SOURCE', ${actor.userId}
        )
      `;
      await tx`
        insert into bridge_production_title_links (
          production_project_id, title_id, link_type, created_by
        ) values (
          ${projectId}::uuid, ${outputTitleId}, 'FINISHED_FILM_OUTPUT', ${actor.userId}
        )
      `;

      await tx`
        update bridge_story_concept_readiness_reviews
        set readiness_status = 'HANDED_OFF',
            production_organization_id = ${data.productionOrganizationId}::uuid,
            production_project_id = ${projectId}::uuid,
            finished_film_title_id = ${outputTitleId},
            handed_off_by = ${actor.userId},
            handed_off_at = now(),
            updated_at = now()
        where id = ${review.id} and readiness_status = 'APPROVED'
      `;

      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.production_handoff",
        entityType: "bridge_story_concept_readiness_review",
        entityId: review.id,
        metadata: {
          conceptSubmissionId: data.conceptSubmissionId,
          sourceTitleId: source.title_id,
          productionOrganizationId: data.productionOrganizationId,
          productionProjectId: projectId,
          finishedFilmTitleId: outputTitleId,
          qualifyingInterestCount: positive[0].qualifying_interest_count,
        },
      }, tx);

      return {
        handedOff: true,
        productionProjectId: projectId,
        sourceTitleId: source.title_id,
        finishedFilmTitleId: outputTitleId,
        productionStatus: "PRE_PRODUCTION",
        finishedFilmStatus: "DRAFT",
      };
    });
  });
