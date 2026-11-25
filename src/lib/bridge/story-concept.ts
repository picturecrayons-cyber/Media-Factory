import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

async function requireOwnedTitle(sql: Awaited<ReturnType<typeof getSql>>, actor: Awaited<ReturnType<typeof requireVerifiedActor>>, titleId: string) {
  const rows = await sql.unsafe(
    "select t.id,t.owner_user_id,t.owner_account_type,t.owner_organization_id from bridge_titles t where t.id=$1 and t.archived_at is null limit 1",
    [titleId],
  ) as Array<{ id: string; owner_user_id: string; owner_account_type: string; owner_organization_id: string | null }>;
  const title = rows[0];
  if (!title) throw new Error("Title not found");
  const ownsDirectly = title.owner_user_id === actor.userId && title.owner_account_type === actor.accountType;
  const ownsStudio = actor.accountType === "studio" && title.owner_account_type === "studio" &&
    Boolean(title.owner_organization_id) && title.owner_organization_id === actor.organizationId;
  if (!ownsDirectly && !ownsStudio) throw new Error("You can manage only your own Creator/Studio titles");
  return title;
}

export const listOwnStoryConceptSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") throw new Error("Creator or Studio account required");
    assertPermission(actor, "story_concept.read_own");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select sc.id::text,sc.title_id,bt.name as title_name,sc.owner_submission_status,sc.logline,sc.synopsis,sc.genre,sc.format,sc.estimated_budget_range,sc.fee_certified_at,sc.legal_status,sc.editorial_status,sc.curation_status,sc.introduced_to_buyers_at,sc.created_at from bridge_story_concept_submissions sc join bridge_titles bt on bt.id=sc.title_id where (bt.owner_user_id=$1 and bt.owner_account_type=$2) or (bt.owner_account_type='studio' and bt.owner_organization_id=$3) order by sc.created_at desc",
      [actor.userId, actor.accountType, actor.organizationId ?? null],
    );
    return { storyConcepts: JSON.parse(JSON.stringify(rows)) };
  });

export const createStoryConceptSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    paymentRecordId: z.string().min(8),
    logline: z.string().trim().min(10).max(500),
    synopsis: z.string().trim().min(30).max(12000),
    genre: z.string().trim().min(2).max(120),
    format: z.string().trim().min(2).max(80),
    targetAudience: z.string().trim().max(200).optional(),
    estimatedBudgetRange: z.string().trim().max(160).optional(),
    intendedDistribution: z.string().trim().max(300).optional(),
    rightsBasis: z.enum(["ORIGINAL_AUTHOR","ASSIGNED","LICENSED","PUBLIC_DOMAIN","OTHER"]),
    rightsNotes: z.string().trim().max(4000).optional(),
    sourceMaterialReference: z.string().trim().max(1000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") throw new Error("Creator or Studio account required");
    assertPermission(actor, "story_concept.create");
    const sql = await getSql();
    const title = await requireOwnedTitle(sql, actor, data.titleId);
    const payments = await sql.unsafe(
      "select id,user_id,purpose,status,verified_at,amount_paise,currency from bridge_payments where id=$1 limit 1",
      [data.paymentRecordId],
    ) as Array<{ id: string; user_id: string; purpose: string; status: string; verified_at: string | Date | null; amount_paise: number; currency: string }>;
    const payment = payments[0];
    if (!payment || payment.user_id !== actor.userId || payment.purpose !== "STORY_CONCEPT_NETWORK_SUBMISSION" ||
        payment.status !== "captured" || !payment.verified_at || payment.currency !== "INR") {
      throw new Error("Story Concept setup is blocked: verified Razorpay payment is required first");
    }
    const existing = await sql.unsafe(
      "select id::text from bridge_story_concept_submissions where title_id=$1 limit 1",
      [data.titleId],
    ) as Array<{ id: string }>;
    if (existing[0]) throw new Error("A Story Concept submission already exists for this title");
    const inserted = await sql.unsafe(
      "insert into bridge_story_concept_submissions (title_id,owner_user_id,owner_submission_status,logline,synopsis,genre,format,target_audience,estimated_budget_range,intended_distribution,rights_basis,rights_notes,source_material_reference,payment_id,fee_certified_at) values ($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id::text",
      [title.id, actor.userId, data.logline, data.synopsis, data.genre, data.format, data.targetAudience ?? null, data.estimatedBudgetRange ?? null, data.intendedDistribution ?? null, data.rightsBasis, data.rightsNotes ?? null, data.sourceMaterialReference ?? null, payment.id, payment.verified_at],
    ) as Array<{ id: string }>;
    if (!inserted[0]) throw new Error("Story Concept setup failed");
    await writeAudit({
      actorUserId: actor.userId, action: "story_concept.create",
      entityType: "bridge_story_concept_submission", entityId: inserted[0].id,
      metadata: { titleId: title.id, paymentId: payment.id, feeCertified: true, accountType: actor.accountType },
    });
    return { storyConceptId: inserted[0].id, titleId: title.id, feeCertified: true };
  });

export const submitStoryConceptForReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ storyConceptId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") throw new Error("Creator or Studio account required");
    assertPermission(actor, "story_concept.create");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "update bridge_story_concept_submissions sc set owner_submission_status='SUBMITTED',updated_at=now() from bridge_titles t where sc.id=$1 and sc.title_id=t.id and sc.fee_certified_at is not null and sc.owner_submission_status in ('DRAFT','NEEDS_CORRECTION') and ((t.owner_user_id=$2 and t.owner_account_type=$3) or (t.owner_account_type='studio' and t.owner_organization_id=$4)) returning sc.id::text,sc.title_id",
      [data.storyConceptId, actor.userId, actor.accountType, actor.organizationId ?? null],
    ) as Array<{ id: string; title_id: string }>;
    if (!rows[0]) throw new Error("Story Concept cannot be submitted: payment or title ownership check failed");
    await writeAudit({
      actorUserId: actor.userId, action: "story_concept.submit",
      entityType: "bridge_story_concept_submission", entityId: rows[0].id,
      metadata: { titleId: rows[0].title_id },
    });
    return { submitted: true, storyConceptId: rows[0].id };
  });
