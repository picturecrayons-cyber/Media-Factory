import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

const submissionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  synopsis: z.string().trim().min(1).max(4000),
  contentType: z.enum(["FEATURE", "SERIES", "SHORT", "DOCUMENTARY", "OTHER"]),
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
  buyerChannels: z.array(z.string().trim().min(2).max(80)).max(30),
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

    const id = randomBytes(16).toString("hex");
    const slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "title"}-${id.slice(0, 6)}`;
    const sql = await getSql();

    await sql`
      insert into bridge_titles (
        id, slug, name, original_title, owner_user_id, owner_account_type, status,
        synopsis, long_synopsis, language, original_language, year, runtime_minutes,
        content_type, country_of_origin, release_date
      ) values (
        ${id}, ${slug}, ${data.name}, ${data.name}, ${actor.userId}, ${actor.accountType}, 'DRAFT',
        ${data.synopsis}, ${data.synopsis}, ${data.originalLanguage}, ${data.originalLanguage},
        ${data.releaseYear}, ${data.runtimeMinutes}, ${data.contentType}, ${data.countryOfOrigin},
        make_date(${data.releaseYear}, 1, 1)
      )
    `;

    const rightsRows = await sql<{ id: string }>`
      insert into bridge_rights_grants (
        title_id, grant_type, territories, languages, media, window_start, window_end,
        exclusivity, evidence, status, created_by
      ) values (
        ${id}, 'DISTRIBUTION', ${JSON.stringify(data.territories)}::jsonb,
        ${JSON.stringify(data.rightsLanguages)}::jsonb, ${JSON.stringify(data.exploitation)}::jsonb,
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
        ${JSON.stringify(data.buyerChannels)}::jsonb, ${data.screenerMode}, ${data.screenerUrl ?? null}
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
        buyerChannels: data.buyerChannels,
      },
    });

    return { titleId: id, status: "DRAFT" as const };
  });
