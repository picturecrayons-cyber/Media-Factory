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
  const missing = requiredForSubmission.filter((key) => {
    const field = value[key];
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
        (${id},${title.id},${actor.userId},${actor.accountType==="studio"?actor.organizationId??null:null},${JSON.stringify(data.details)}::jsonb,'DRAFT',${actor.userId})
      on conflict (title_id) do update set
        owner_user_id=excluded.owner_user_id,
        owner_organization_id=excluded.owner_organization_id,
        details=excluded.details,
        submission_status=case when bridge_title_owner_submissions.submission_status='SUBMITTED' then 'SUBMITTED' else 'DRAFT' end,
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
    const rows=await sql<{details:unknown}> `
      select details from bridge_title_owner_submissions
      where title_id=${title.id} and owner_user_id=${actor.userId} for update
    `;
    const row=rows[0];
    if (!row) throw new Error("Save the owner details draft before submitting");
    const details=detailsSchema.parse(row.details);
    completeDetails(details);
    await sql `
      update bridge_title_owner_submissions set
        submission_status='SUBMITTED',submitted_at=now(),submitted_by=${actor.userId},
        updated_by=${actor.userId},updated_at=now()
      where title_id=${title.id} and owner_user_id=${actor.userId}
    `;
    await writeAudit({actorUserId:actor.userId,action:"title.owner_submission_submitted",entityType:"bridge_title",entityId:title.id,metadata:{titleStatus:title.status}});
    // Owner details submission is intentionally separate from title QC,
    // rights review, legal approval, licensing and publication state.
    return {submitted:true as const,titleStatus:title.status};
  });
