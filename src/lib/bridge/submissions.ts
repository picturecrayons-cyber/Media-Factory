import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission, canMutateTitle } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { storedBridgeContentType } from "./loop-lanes";
import { assertAccountMandateScope, loadTitle } from "./titles";
import { assertCreatorTitleCanSubmit } from "./creator-title-lifecycle";
import type { TitleStatus } from "./types";

const BUYER_DESTINATION_MAP: Record<string, string> = {
  "OTT platform": "External OTT",
  "Broadcaster": "Broadcast / TV",
  "Distributor": "Buyer delivery",
  "Aggregator": "Buyer delivery",
  "International buyer": "Buyer delivery",
  "Educational buyer": "Festival / Educational",
  "Festival / screening": "Festival / Educational",
  "Crayons Loop": "Crayons Loop",
  "Open to qualified buyers": "Buyer delivery",
};

const EXPLOITATION_MEDIA_MAP: Record<string, string> = {
  "OTT / Streaming": "SVOD",
  "SVOD": "SVOD",
  "TVOD": "TVOD",
  "AVOD": "AVOD",
  "FAST": "FAST",
  "Broadcast / TV": "BROADCAST",
  "Theatrical": "THEATRICAL",
  "Educational": "EDUCATIONAL",
  "Airline / Ancillary": "AIRLINE",
  "Festival / Screening": "FESTIVAL",
};

const submissionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  synopsis: z.string().trim().min(1).max(4000),
  contentType: z.enum(["Film", "Series", "Vertical drama", "Short", "Documentary", "Other"]),
  loopDistributionPreference: z.enum(["NOT_DECIDED", "CONSIDER_LOOP", "NOT_FOR_LOOP"]).default("NOT_DECIDED"),
  originalLanguage: z.string().trim().min(2).max(40),
  countryOfOrigin: z.string().trim().min(2).max(80),
  releaseYear: z.number().int().min(1895).max(2100),
  runtimeMinutes: z.number().int().min(1).max(600),
  rightsLanguages: z.array(z.string().trim().min(2).max(40)).min(1).max(30),
  territories: z.array(z.string().trim().min(2).max(80)).min(1).max(200),
  exploitation: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  exclusivity: z.enum(["EXCLUSIVE", "NON_EXCLUSIVE"]),
  authorityType: z.enum([
    "RIGHTS_OWNER",
    "PRODUCER",
    "AUTHORIZED_REPRESENTATIVE",
    "DISTRIBUTOR_SALES_AGENT",
    "LICENSEE_WITH_ONWARD_RIGHTS",
    "OTHER",
  ]),
  authorizationEvidenceType: z.enum([
    "RIGHTS_AGREEMENT",
    "CHAIN_OF_TITLE",
    "AUTHORIZATION_LETTER",
    "DISTRIBUTION_AGREEMENT",
    "OTHER",
  ]),
  authorizationConfirmed: z.literal(true),
  buyerChannels: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
  screenerMode: z.enum(["NONE", "PRIVATE_BRIDGE", "SECURE_EXTERNAL"]),
  screenerUrl: z.string().url().max(2000).optional(),
}).superRefine((data, ctx) => {
  if (new Date(data.windowEnd) <= new Date(data.windowStart)) {
    ctx.addIssue({ code: "custom", path: ["windowEnd"], message: "Rights end must be after rights start" });
  }
  if (data.screenerMode === "SECURE_EXTERNAL" && !data.screenerUrl) {
    ctx.addIssue({ code: "custom", path: ["screenerUrl"], message: "Secure screener URL is required" });
  }
});

export const createRightsReadySubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(submissionSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);

    if (!["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Only creator and studio accounts can submit titles");
    }
    assertPermission(actor, "title.create");
    if (actor.accountType === "studio" && !actor.organizationId) {
      throw new Error("A verified active Studio organization membership is required before creating a Studio submission.");
    }

    const mappedDestinations = data.buyerChannels.map((value) => BUYER_DESTINATION_MAP[value]);
    const mappedMedia = data.exploitation.map((value) => EXPLOITATION_MEDIA_MAP[value]);
    if (mappedDestinations.some((value) => !value) || mappedMedia.some((value) => !value)) {
      throw new Error("Select only supported Bridge distribution destinations and exploitation rights.");
    }
    const destinations = [...new Set(mappedDestinations as string[])];
    const media = [...new Set(mappedMedia as string[])];

    const id = randomBytes(16).toString("hex");
    const slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "title"}-${id.slice(0, 6)}`;
    const sql = await getSql();
    await assertAccountMandateScope(sql, actor, destinations, media, false);

    await sql`
      insert into bridge_titles (
        id, slug, name, original_title, owner_user_id, owner_account_type, owner_organization_id, status,
        synopsis, long_synopsis, language, original_language, year, runtime_minutes,
        content_type, loop_distribution_preference, country_of_origin, release_date
      ) values (
        ${id}, ${slug}, ${data.name}, ${data.name}, ${actor.userId}, ${actor.accountType},
        ${actor.accountType === "studio" ? actor.organizationId : null}, 'DRAFT',
        ${data.synopsis}, ${data.synopsis}, ${data.originalLanguage}, ${data.originalLanguage},
        ${data.releaseYear}, ${data.runtimeMinutes}, ${storedBridgeContentType(data.contentType)}, ${data.loopDistributionPreference}, ${data.countryOfOrigin},
        make_date(${data.releaseYear}, 1, 1)
      )
    `;

    const rightsRows = await sql<{ id: string }>`
      insert into bridge_rights_grants (
        title_id, grant_type, territories, languages, media, window_start, window_end,
        exclusivity, evidence, status, created_by
      ) values (
        ${id}, 'DISTRIBUTION', ${JSON.stringify(data.territories)}::jsonb,
        ${JSON.stringify(data.rightsLanguages)}::jsonb, ${JSON.stringify(media)}::jsonb,
        ${data.windowStart}, ${data.windowEnd}, ${data.exclusivity},
        ${JSON.stringify([{ type: data.authorizationEvidenceType, status: "PENDING_REVIEW" }])}::jsonb,
        'DRAFT', ${actor.userId}
      )
      returning id::text
    `;

    await sql`
      insert into bridge_legal_cases (title_id, status, evidence)
      values (
        ${id}, 'PENDING',
        ${JSON.stringify([{
          authorityType: data.authorityType,
          evidenceType: data.authorizationEvidenceType,
          authorizationConfirmed: data.authorizationConfirmed,
          status: "PENDING_EVIDENCE_REVIEW"
        }])}::jsonb
      )
    `;

    await sql`
      insert into bridge_title_submission_intake (
        title_id, authority_type, authorization_evidence_type, authorization_confirmed,
        buyer_channels, screener_mode, screener_url
      ) values (
        ${id}, ${data.authorityType}, ${data.authorizationEvidenceType}, ${data.authorizationConfirmed},
        ${JSON.stringify(destinations)}::jsonb, ${data.screenerMode}, ${data.screenerUrl ?? null}
      )
    `;

    await sql`
      insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
      values (${id}, null, 'DRAFT', ${actor.userId}, 'rights-ready public submission')
    `;

    await writeAudit({
      actorUserId: actor.userId,
      action: "title.rights_ready_submission.create",
      entityType: "bridge_title",
      entityId: id,
      metadata: {
        rightsGrantId: rightsRows[0]?.id ?? null,
        screenerMode: data.screenerMode,
        buyerChannels: destinations,
        loopDistributionPreference: data.loopDistributionPreference,
      },
    });

    return { titleId: id, status: "DRAFT" as const };
  });


const creatorBridgeSubmissionSchema = z.object({
  titleId: z.string().min(8).max(80),
  name: z.string().trim().min(1).max(160),
  synopsis: z.string().trim().min(20).max(4000),
  language: z.string().trim().min(2).max(40),
  countryOfOrigin: z.string().trim().min(2).max(80),
  year: z.number().int().min(1895).max(2100),
  runtimeMinutes: z.number().int().min(1).max(600),
  territories: z.array(z.string().trim().min(2).max(80)).min(1).max(200),
  buyerChannels: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  rightsLanguages: z.array(z.string().trim().min(2).max(40)).min(1).max(30),
  exploitation: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  exclusivity: z.enum(["EXCLUSIVE", "NON_EXCLUSIVE"]),
  authorityType: z.enum([
    "RIGHTS_OWNER", "PRODUCER", "AUTHORIZED_REPRESENTATIVE",
    "DISTRIBUTOR_SALES_AGENT", "LICENSEE_WITH_ONWARD_RIGHTS", "OTHER",
  ]),
  authorizationEvidenceType: z.enum([
    "RIGHTS_AGREEMENT", "CHAIN_OF_TITLE", "AUTHORIZATION_LETTER",
    "DISTRIBUTION_AGREEMENT", "OTHER",
  ]),
  authorizationConfirmed: z.literal(true),
}).superRefine((data, ctx) => {
  if (new Date(data.windowEnd) <= new Date(data.windowStart)) {
    ctx.addIssue({ code: "custom", path: ["windowEnd"], message: "Rights end must be after rights start" });
  }
  if (new Date(data.windowEnd) <= new Date()) {
    ctx.addIssue({ code: "custom", path: ["windowEnd"], message: "Rights window must remain active at submission time" });
  }
});

export const submitCreatorTitleToBridge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(creatorBridgeSubmissionSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Only the owning Creator or an active Studio member can submit this title.");
    }
    assertPermission(actor, "title.update_own");

    const title = await loadTitle(data.titleId);
    if (!title || title.ownerAccountType !== actor.accountType ||
        !canMutateTitle(actor, title, "title.update_own", "title.license")) {
      throw new Error("Title not found");
    }

    const sql = await getSql();
    if (actor.accountType === "studio" && title.ownerOrganizationId) {
      const memberships = await sql<{ allowed: boolean }>`
        select exists (
          select 1 from bridge_organization_memberships
          where organization_id = ${title.ownerOrganizationId}::uuid
            and user_id = ${actor.userId}
            and status = 'active'
        ) as allowed
      `;
      if (!memberships[0]?.allowed && title.ownerUserId !== actor.userId) {
        throw new Error("Active Studio membership is required to submit this title.");
      }
    }

    return sql.transaction(async (tx) => {
      const lockedRows = await tx<{
        id: string; owner_user_id: string; owner_account_type: string;
        owner_organization_id: string | null; status: string;
        submission_type: string | null; creator_submission_status: "DRAFT" | "SUBMITTED";
        deleted_at: string | Date | null; name: string; synopsis: string;
        language: string; country_of_origin: string | null; year: number | null;
        runtime_minutes: number | null;
      }>`
        select id, owner_user_id, owner_account_type, owner_organization_id,
          status, submission_type, creator_submission_status, deleted_at,
          name, synopsis, language, country_of_origin, year, runtime_minutes
        from bridge_titles where id = ${data.titleId} for update
      `;
      const locked = lockedRows[0];
      if (!locked || locked.owner_user_id !== title.ownerUserId ||
          locked.owner_account_type !== actor.accountType ||
          (locked.owner_organization_id ?? null) !== (title.ownerOrganizationId ?? null)) {
        throw new Error("Title not found");
      }
      if (actor.accountType === "studio" && locked.owner_organization_id && locked.owner_user_id !== actor.userId) {
        const activeMembership = await tx<{ allowed: boolean }>`
          select exists (
            select 1 from bridge_organization_memberships
            where organization_id = ${locked.owner_organization_id}::uuid
              and user_id = ${actor.userId}
              and status = 'active'
          ) as allowed
        `;
        if (!activeMembership[0]?.allowed) throw new Error("Active Studio membership is required to submit this title.");
      }
      if (locked.creator_submission_status === "SUBMITTED") {
        return { titleId: locked.id, status: "SUBMITTED" as const, alreadySubmitted: true };
      }

      const metadata = {
        name: data.name,
        synopsis: data.synopsis,
        language: data.language,
        countryOfOrigin: data.countryOfOrigin,
        year: data.year,
        runtimeMinutes: data.runtimeMinutes,
      };
      assertCreatorTitleCanSubmit({
        status: locked.status as TitleStatus,
        submissionStatus: locked.creator_submission_status,
        deletedAt: locked.deleted_at,
        submissionType: locked.submission_type,
      }, metadata);

      const counts = await tx<{
        grant_count: number; intake_count: number; legal_case_count: number;
        valid_grant_count: number; valid_intake_count: number;
        saved_destinations: unknown; saved_media: unknown;
      }>`
        select
          (select count(*)::int from bridge_rights_grants where title_id = ${locked.id}) as grant_count,
          (select count(*)::int from bridge_title_submission_intake where title_id = ${locked.id}) as intake_count,
          (select count(*)::int from bridge_legal_cases where title_id = ${locked.id}) as legal_case_count,
          (select count(*)::int from bridge_rights_grants
            where title_id = ${locked.id}
              and status = 'DRAFT'
              and case when jsonb_typeof(territories) = 'array' then jsonb_array_length(territories) > 0 else false end
              and case when jsonb_typeof(languages) = 'array' then jsonb_array_length(languages) > 0 else false end
              and case when jsonb_typeof(media) = 'array' then jsonb_array_length(media) > 0 else false end
              and window_start is not null and window_end > now()) as valid_grant_count,
          (select count(*)::int from bridge_title_submission_intake
            where title_id = ${locked.id}
              and authorization_confirmed = true
              and nullif(trim(authority_type), '') is not null
              and nullif(trim(authorization_evidence_type), '') is not null) as valid_intake_count,
          (select buyer_channels from bridge_title_submission_intake where title_id = ${locked.id} limit 1) as saved_destinations,
          (select media from bridge_rights_grants where title_id = ${locked.id} limit 1) as saved_media
      `;
      const existing = counts[0];
      const packageRows = existing.grant_count + existing.intake_count + existing.legal_case_count;
      const mandateDestinations = packageRows === 0
        ? data.buyerChannels
        : Array.isArray(existing.saved_destinations) ? existing.saved_destinations as string[] : [];
      const mandateMedia = packageRows === 0
        ? data.exploitation
        : Array.isArray(existing.saved_media) ? existing.saved_media as string[] : [];
      if (!mandateDestinations.length || !mandateMedia.length) {
        throw new Error("Rights destinations and exploitation scope must be present before submission.");
      }
      await assertAccountMandateScope(tx, actor, mandateDestinations, mandateMedia, false);
      if (packageRows === 0) {
        await tx`
          insert into bridge_rights_grants (
            title_id, grant_type, territories, languages, media, window_start, window_end,
            exclusivity, evidence, status, created_by
          ) values (
            ${locked.id}, 'DISTRIBUTION', ${JSON.stringify(data.territories)}::jsonb,
            ${JSON.stringify(data.rightsLanguages)}::jsonb, ${JSON.stringify(data.exploitation)}::jsonb,
            ${data.windowStart}, ${data.windowEnd}, ${data.exclusivity},
            ${JSON.stringify([{ type: data.authorizationEvidenceType, status: "PENDING_REVIEW" }])}::jsonb,
            'DRAFT', ${actor.userId}
          )
        `;
        await tx`
          insert into bridge_legal_cases (title_id, status, evidence)
          values (
            ${locked.id}, 'PENDING',
            ${JSON.stringify([{
              authorityType: data.authorityType,
              evidenceType: data.authorizationEvidenceType,
              authorizationConfirmed: true,
              status: "PENDING_EVIDENCE_REVIEW",
            }])}::jsonb
          )
        `;
        await tx`
          insert into bridge_title_submission_intake (
            title_id, authority_type, authorization_evidence_type, authorization_confirmed,
            buyer_channels, screener_mode, screener_url
          ) values (
            ${locked.id}, ${data.authorityType}, ${data.authorizationEvidenceType}, true,
            ${JSON.stringify(data.buyerChannels)}::jsonb, 'NONE', null
          )
        `;
      } else if (
        existing.grant_count !== 1 || existing.intake_count !== 1 ||
        existing.legal_case_count < 1 || existing.valid_grant_count !== 1 ||
        existing.valid_intake_count !== 1
      ) {
        throw new Error("An existing rights package is incomplete or inconsistent. Bridge staff must reconcile it before submission.");
      }

      await tx`
        update bridge_titles set
          name = ${metadata.name},
          synopsis = ${metadata.synopsis},
          language = ${metadata.language},
          country_of_origin = ${metadata.countryOfOrigin},
          year = ${metadata.year},
          runtime_minutes = ${metadata.runtimeMinutes},
          creator_submission_status = 'SUBMITTED',
          creator_submitted_at = now(),
          updated_at = now()
        where id = ${locked.id} and creator_submission_status = 'DRAFT' and deleted_at is null
      `;
      await tx`
        insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
        values (${locked.id}, 'DRAFT', 'DRAFT', ${actor.userId}, 'Creator submitted title to Bridge; QC and rights review pending')
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "title.creator_submit",
        entityType: "bridge_title",
        entityId: locked.id,
        metadata: { status: "SUBMITTED", rightsPackagePreserved: packageRows > 0 },
      }, tx);
      return { titleId: locked.id, status: "SUBMITTED" as const, alreadySubmitted: false };
    });
  });
