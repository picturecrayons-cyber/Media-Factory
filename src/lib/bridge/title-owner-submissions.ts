import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { canMutateTitle, canReadTitle } from "./rbac";
import { writeAudit } from "./audit";

const creditsSchema = z.array(z.object({
  role: z.enum(["Director","Producer","Writer","Cinematographer","Editor","Music","Cast","Other"]),
  name: z.string().trim().min(1).max(160),
})).max(150);

const detailsSchema = z.object({
  originalTitle: z.string().trim().max(160).optional(),
  productionCompany: z.string().trim().max(200).optional(),
  completionDate: z.string().trim().max(40).optional(),
  masterVersion: z.string().trim().max(120).optional(),
  resolution: z.enum(["SD","HD","2K","4K","6K","8K","OTHER"]).optional(),
  codec: z.string().trim().max(80).optional(),
  masterLanguage: z.string().trim().max(40).optional(),
  subtitleLanguages: z.array(z.string().trim().min(2).max(40)).max(20).optional(),
  rightsBasis: z.enum(["OWNER","EXCLUSIVE_LICENSEE","AUTHORIZED_DISTRIBUTOR","PRODUCER_AUTHORITY"]).optional(),
  territories: z.array(z.string().trim().min(2).max(80)).max(250).optional(),
  rightsLanguages: z.array(z.string().trim().min(2).max(40)).max(20).optional(),
  media: z.array(z.string().trim().min(2).max(40)).max(20).optional(),
  rightsStartDate: z.string().trim().max(40).optional(),
  rightsEndDate: z.string().trim().max(40).optional(),
  exclusivity: z.enum(["EXCLUSIVE","NON_EXCLUSIVE"]).optional(),
  contactName: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().max(254).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  credits: creditsSchema.optional(),
});

const requiredForSubmission = [
  "originalTitle",
  "productionCompany",
  "masterVersion",
  "resolution",
  "codec",
  "masterLanguage",
  "rightsBasis",
  "territories",
  "rightsLanguages",
  "media",
  "rightsStartDate",
  "rightsEndDate",
  "contactName",
  "contactEmail",
  "contactPhone",
] as const;

function completeDetails(value: z.infer<typeof detailsSchema>) {
  const missing: string[] = requiredForSubmission.filter((key) => {
    const field: unknown = value[key];
    return Array.isArray(field) ? field.length === 0 : !field;
  });
  if (!value.credits?.some((credit) => credit.role === "Director")) missing.push("Director credit");
  if (!value.credits?.some((credit) => credit.role === "Producer")) missing.push("Producer credit");
  if (missing.length) throw new Error(`Complete these owner details before submitting: ${missing.join(", ")}`);
  if (value.rightsStartDate && value.rightsEndDate) {
    const start = new Date(value.rightsStartDate);
    const end = new Date(value.rightsEndDate);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new Error("Rights period is invalid. End date must be after start date.");
    }
  }
}

async function ownerScope(actor: {userId:string; accountType:string; internalRole?:string|null; organizationId?:string|null}, titleId: string) {
  const title = await loadTitle(titleId);
  if (!title) throw new Error("Title not found");
  if (!canMutateTitle(actor, title, "title.update_own", "title.license")) {
    throw new Error("Only the verified title owner or authorized Studio organization can update submission details");
  }
  if (!actor.internalRole && !["DRAFT","UPLOADING","PREPARING"].includes(title.status)) {
    throw new Error("Owner submission details are locked after the title enters QC review");
  }
  return title;
}

export const getTitleOwnerSubmission = createServerFn({method:"GET"})
  .middleware([authMiddleware])
  .validator(z.object({titleId:z.string().min(8)}))
  .handler(async ({context,data}) => {
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    const title=await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor,title)) throw new Error("Title not found");
    const sql=await getSql();
    const rows=await sql<{details:unknown;submission_status:string;updated_at:string|Date|null;submitted_at:string|Date|null;submitted_by:string|null}> `
      select details,submission_status,updated_at,submitted_at,submitted_by
      from bridge_title_owner_submissions where title_id=${title.id} limit 1
    `;
    const row=rows[0];
    return {submission:row?{details:row.details, status:row.submission_status,updatedAt:row.updated_at,submittedAt:row.submitted_at,submittedBy:row.submitted_by}:null};
  });

export const saveTitleOwnerSubmission = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator(z.object({titleId:z.string().min(8),details:detailsSchema}))
  .handler(async ({context,data}) => {
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    const title=await ownerScope(actor,data.titleId);
    const sql=await getSql();
    const id=randomBytes(16).toString("hex");
    await sql `
      insert into bridge_title_owner_submissions
        (id,title_id,owner_user_id,owner_organization_id,details,submission_status,updated_by)
      values
        (${id},${title.id},${title.ownerUserId},${title.ownerOrganizationId??null},${JSON.stringify(data.details)}::jsonb,'DRAFT',${actor.userId})
      on conflict (title_id) do update set
        details=excluded.details,
        submission_status='DRAFT',
        submitted_at=null,
        submitted_by=null,
        updated_by=excluded.updated_by,
        updated_at=now()
    `;
    await writeAudit({actorUserId:actor.userId,action:"title.owner_submission_saved",entityType:"bridge_title",entityId:title.id});
    return {saved:true as const};
  });

export const submitTitleOwnerDetails = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator(z.object({titleId:z.string().min(8)}))
  .handler(async ({context,data}) => {
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    const title=await ownerScope(actor,data.titleId);
    const sql=await getSql();
    await sql.transaction(async (tx) => {
      const rows=await tx<{details:unknown; owner_user_id:string; owner_organization_id:string|null}> `
        select details, owner_user_id, owner_organization_id
        from bridge_title_owner_submissions
        where title_id=${title.id}
        for update
      `;
      const row=rows[0];
      const sameOwner = row && (
        row.owner_user_id === title.ownerUserId ||
        (title.ownerAccountType === "studio" &&
          row.owner_organization_id === title.ownerOrganizationId &&
          title.ownerOrganizationId !== null)
      );
      if (!row || !sameOwner) throw new Error("Save the owner details draft before submitting");
      const details=detailsSchema.parse(row.details);
      completeDetails(details);
      await tx `
        update bridge_title_owner_submissions set
          submission_status='SUBMITTED',submitted_at=now(),submitted_by=${actor.userId},
          updated_by=${actor.userId},updated_at=now()
        where title_id=${title.id}
      `;
    });
    await writeAudit({actorUserId:actor.userId,action:"title.owner_submission_submitted",entityType:"bridge_title",entityId:title.id,metadata:{titleStatus:title.status}});
    // Owner details submission is intentionally separate from title QC,
    // rights review, legal approval, licensing and publication state.
    return {submitted:true as const,titleStatus:title.status};
  });

/** Super Admin intake queue. Owner details are visible for review only; no gate is changed. */
export const listOwnerSubmissionQueue = createServerFn({method:"GET"})
  .middleware([authMiddleware])
  .handler(async ({context}) => {
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    const sql=await getSql();
    const rows=await sql<{
      title_id:string; title_name:string; title_status:string; owner_user_id:string;
      owner_email:string|null; owner_display_name:string|null; owner_organization_id:string|null;
      details:unknown; submission_status:string; submitted_at:string|Date|null; updated_at:string|Date;
    }>`
      select s.title_id,t.name as title_name,t.status as title_status,
        s.owner_user_id,p.email as owner_email,p.display_name as owner_display_name,
        s.owner_organization_id,s.details,s.submission_status,s.submitted_at,s.updated_at
      from bridge_title_owner_submissions s
      join bridge_titles t on t.id=s.title_id
      left join bridge_profiles p on p.user_id=s.owner_user_id
      where s.submission_status='SUBMITTED'
      order by s.submitted_at asc nulls last
      limit 200
    `;
    return {submissions:rows};
  });

/**
 * Unified Founder Centre intake. This is a read-only overview of both
 * submission products; it never changes title, curation, QC, Legal or rights
 * status. Access is limited to verified Super Admins.
 */
export const listFounderSubmissionInbox = createServerFn({method:"GET"})
  .middleware([authMiddleware])
  .handler(async ({context}) => {
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");

    const sql=await getSql();
    const rows=await sql<{
      title_id:string;
      title_name:string;
      submission_type:string;
      title_status:string;
      owner_user_id:string;
      owner_account_type:string;
      owner_organization_id:string|null;
      owner_email:string|null;
      owner_display_name:string|null;
      owner_organization_name:string|null;
      created_at:string|Date;
      updated_at:string|Date;
      concept_curation_status:string|null;
      concept_editorial_status:string|null;
      concept_legal_status:string|null;
      owner_details_status:string|null;
      owner_details_submitted_at:string|Date|null;
    }>`
      select
        t.id as title_id,
        t.name as title_name,
        coalesce(t.submission_type, 'finished_film') as submission_type,
        t.status as title_status,
        t.owner_user_id,
        t.owner_account_type,
        t.owner_organization_id,
        p.email as owner_email,
        p.display_name as owner_display_name,
        p.organization_name as owner_organization_name,
        t.created_at,
        t.updated_at,
        c.curation_status as concept_curation_status,
        c.editorial_status as concept_editorial_status,
        c.legal_status as concept_legal_status,
        s.submission_status as owner_details_status,
        s.submitted_at as owner_details_submitted_at
      from bridge_titles t
      left join bridge_profiles p on p.user_id=t.owner_user_id
      left join bridge_story_concept_submissions c on c.title_id=t.id
      left join bridge_title_owner_submissions s on s.title_id=t.id
      where coalesce(t.submission_type, 'finished_film') in ('finished_film','story_concept')
      order by t.created_at desc
      limit 300
    `;

    return {
      submissions: rows.map((row) => ({
        ...row,
        submission_type: row.submission_type === "story_concept" ? "story_concept" : "finished_film",
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        owner_details_submitted_at: row.owner_details_submitted_at == null
          ? null
          : row.owner_details_submitted_at instanceof Date
            ? row.owner_details_submitted_at.toISOString()
            : String(row.owner_details_submitted_at),
      })),
    };
  });
