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


const adminQueueInput = z.object({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const submissionProofSql = `
  select coalesce(json_agg(json_build_object(
    'kind', a.kind,
    'byteSize', a.byte_size,
    'contentType', a.content_type,
    'checksumSha256', to_jsonb(a)->>'checksum_sha256',
    'verifiedAt', to_jsonb(a)->>'storage_verified_at',
    'verified', a.byte_size > 0
      and length(to_jsonb(a)->>'checksum_sha256') = 44
      and to_jsonb(a)->>'storage_verified_at' is not null
  ) order by a.created_at desc), '[]'::json)
  from bridge_assets a where a.title_id = t.id
`;

export const listAdminSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(adminQueueInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
      throw new Error("Admin submissions access required");
    }
    assertPermission(actor, "title.admin_queue_read");
    const sql = await getSql();
    const rows = await sql<{
      id: string; name: string; status: string; owner_user_id: string;
      owner_account_type: string; owner_name: string | null; owner_email: string | null;
      created_at: string | Date; updated_at: string | Date;
      storage_proof: unknown; qc_notes: unknown; email_delivery: unknown;
    }>`
      select t.id, t.name, t.status, t.owner_user_id, t.owner_account_type,
        p.display_name as owner_name, p.email as owner_email, t.created_at, t.updated_at,
        (${sql.unsafe(submissionProofSql)}) as storage_proof,
        (select coalesce(json_agg(json_build_object(
          'status', q.status, 'notes', q.reviewer_findings,
          'reviewedBy', q.reviewed_by, 'reviewedAt', q.reviewed_at
        ) order by q.created_at desc), '[]'::json)
         from bridge_qc_cases q where q.title_id = t.id) as qc_notes,
        (select coalesce(json_agg(json_build_object(
          'status', case when a.action = 'email.delivery.sent' then 'SENT' else 'FAILED' end,
          'metadata', a.metadata, 'createdAt', a.created_at
        ) order by a.created_at desc), '[]'::json)
         from bridge_audit_logs a
         where a.entity_type = 'bridge_title' and a.entity_id = t.id
           and a.action in ('email.delivery.sent','email.delivery.failed')) as email_delivery
      from bridge_titles t
      left join bridge_profiles p on p.user_id = t.owner_user_id
      where t.archived_at is null
        and (${data.search ?? ""} = '' or t.name ilike '%' || ${data.search ?? ""} || '%'
          or t.id ilike '%' || ${data.search ?? ""} || '%'
          or coalesce(p.display_name,'') ilike '%' || ${data.search ?? ""} || '%')
        and (${data.status ?? null}::text is null or t.status = ${data.status ?? null})
      order by t.updated_at desc
      limit ${data.limit ?? 50}
    `;
    return { submissions: JSON.parse(JSON.stringify(rows)) };
  });

export const getAdminSubmission = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
      throw new Error("Admin submission detail access required");
    }
    assertPermission(actor, "title.admin_queue_read");
    const sql = await getSql();
    const rows = await sql<{
      id: string; name: string; status: string; synopsis: string;
      owner_user_id: string; owner_account_type: string; owner_name: string | null;
      owner_email: string | null; created_at: string | Date; storage_proof: unknown;
      qc_notes: unknown; intake: unknown; email_delivery: unknown;
    }>`
      select t.id,t.name,t.status,t.synopsis,t.owner_user_id,t.owner_account_type,
        p.display_name as owner_name,p.email as owner_email,t.created_at,
        (${sql.unsafe(submissionProofSql)}) as storage_proof,
        (select coalesce(json_agg(json_build_object(
          'status',q.status,'notes',q.reviewer_findings,'reviewedBy',q.reviewed_by,'reviewedAt',q.reviewed_at
        ) order by q.created_at desc),'[]'::json) from bridge_qc_cases q where q.title_id=t.id) as qc_notes,
        (select to_jsonb(i) from bridge_title_submission_intake i where i.title_id=t.id limit 1) as intake,
        (select coalesce(json_agg(json_build_object(
          'status',case when a.action='email.delivery.sent' then 'SENT' else 'FAILED' end,
          'metadata',a.metadata,'createdAt',a.created_at
        ) order by a.created_at desc),'[]'::json) from bridge_audit_logs a
          where a.entity_type='bridge_title' and a.entity_id=t.id
          and a.action in ('email.delivery.sent','email.delivery.failed')) as email_delivery
      from bridge_titles t left join bridge_profiles p on p.user_id=t.owner_user_id
      where t.id=${data.titleId} and t.archived_at is null limit 1
    `;
    if (!rows[0]) throw new Error("Submission not found");
    return { submission: JSON.parse(JSON.stringify(rows[0])) };
  });

export const listQcQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "qc_reviewer") throw new Error("QC Reviewer access required");
    assertPermission(actor, "title.qc_queue_read");
    const sql = await getSql();
    const rows = await sql<{
      id: string; name: string; status: string; created_at: string | Date;
      storage_proof: unknown; qc_notes: unknown;
    }>`
      select t.id,t.name,t.status,t.created_at,
        (select coalesce(json_agg(json_build_object(
          'kind',a.kind,'byteSize',a.byte_size,'contentType',a.content_type,
          'checksumSha256',coalesce(to_jsonb(a)->>'checksum_sha256',to_jsonb(a)->>'sha256'),
          'verifiedAt',to_jsonb(a)->>'storage_verified_at',
          'verified',a.byte_size>0 and coalesce(to_jsonb(a)->>'checksum_sha256',to_jsonb(a)->>'sha256') is not null
            and to_jsonb(a)->>'storage_verified_at' is not null
        ) order by a.created_at desc),'[]'::json) from bridge_assets a where a.title_id=t.id) as storage_proof,
        (select coalesce(json_agg(json_build_object('status',q.status,'notes',q.reviewer_findings,'reviewedAt',q.reviewed_at)
          order by q.created_at desc),'[]'::json) from bridge_qc_cases q where q.title_id=t.id) as qc_notes
      from bridge_titles t where t.status='QC_REVIEW' and t.archived_at is null
      order by t.updated_at asc limit 100
    `;
    return { queue: JSON.parse(JSON.stringify(rows)) };
  });

export const listLegalQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "legal_reviewer") throw new Error("Legal access required");
    assertPermission(actor, "title.legal_queue_read");
    const sql = await getSql();
    const rows = await sql<{
      id: string; name: string; status: string; created_at: string | Date; legal_cases: unknown;
    }>`
      select t.id,t.name,t.status,t.created_at,
        (select coalesce(json_agg(json_build_object('status',l.status,'classification',l.classification,
          'evidence',l.evidence,'restrictions',l.restrictions,'reviewedAt',l.reviewed_at)
          order by l.created_at desc),'[]'::json) from bridge_legal_cases l where l.title_id=t.id) as legal_cases
      from bridge_titles t where t.status='RIGHTS_REVIEW' and t.archived_at is null
      order by t.updated_at asc limit 100
    `;
    return { queue: JSON.parse(JSON.stringify(rows)) };
  });
