import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor, type BridgeActor } from "./session";
import { loadTitle } from "./titles";
import { canMutateTitle, canReadTitle } from "./rbac";
import { writeAudit } from "./audit";
import { ownerSubmissionSubmitTransition, ownerSubmissionReviewTransition, assertSubmissionDecisionReason } from "./owner-submission-state";
import { submitTitleForQcInTransaction } from "./title-submission";

const creditsSchema = z.array(z.object({
  role: z.enum(["Director","Producer","Writer","Cinematographer","Editor","Music","Cast","Other"]),
  name: z.string().trim().min(1).max(160),
})).max(150);

const detailsSchema = z.object({
  originalTitle: z.string().trim().max(160).optional(),
  productionCompany: z.string().trim().max(200).optional(),
  completionDate: z.string().trim().max(40).optional(),
  masterVersion: z.string().trim().max(120).optional(),
  resolution: z.union([z.enum(["SD","HD","2K","4K","6K","8K","OTHER"]),z.literal("")]).optional(),
  codec: z.string().trim().max(80).optional(),
  masterLanguage: z.string().trim().max(40).optional(),
  subtitleLanguages: z.array(z.string().trim().min(2).max(40)).max(20).optional(),
  rightsBasis: z.union([z.enum(["OWNER","EXCLUSIVE_LICENSEE","AUTHORIZED_DISTRIBUTOR","PRODUCER_AUTHORITY"]),z.literal("")]).optional(),
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

async function ownerScope(actor: BridgeActor, titleId: string) {
  const title = await loadTitle(titleId);
  if (!title) throw new Error("Title not found");
  if (actor.internalRole || !["independent_creator","studio"].includes(actor.accountType) || !canMutateTitle(actor, title, "title.update_own", "title.license")) {
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
    const rows=await sql<{details:unknown;submission_status:string;updated_at:string|Date|null;submitted_at:string|Date|null;submitted_by:string|null;latest_reason:string|null}> `
      select s.details,s.submission_status,s.updated_at,s.submitted_at,s.submitted_by,
        (select e.reason from bridge_owner_submission_events e
         where e.title_id=s.title_id and e.action in ('REQUEST_CHANGES','REJECTED','WITHDRAWN','ARCHIVED')
         order by e.created_at desc limit 1) as latest_reason
      from bridge_title_owner_submissions s where s.title_id=${title.id} limit 1
    `;
    const row=rows[0];
    return {submission:row?{
      details:detailsSchema.parse(row.details),
      status:row.submission_status,
      updatedAt:row.updated_at ? new Date(row.updated_at).toISOString() : null,
      submittedAt:row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      submittedBy:row.submitted_by,
      reason:row.latest_reason,
    }:null};
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
    await sql.transaction(async (tx) => {
      const existing=await tx<{submission_status:string}>`
        select submission_status from bridge_title_owner_submissions
        where title_id=${title.id} for update
      `;
      const current=existing[0]?.submission_status;
      if(current && !["DRAFT","NEEDS_CORRECTION"].includes(current)) {
        throw new Error("Submission details are locked while pending review or after intake acceptance");
      }
      const nextStatus=current==="NEEDS_CORRECTION"?"NEEDS_CORRECTION":"DRAFT";
      await tx `
        insert into bridge_title_owner_submissions
          (id,title_id,owner_user_id,owner_organization_id,details,submission_status,updated_by)
        values
          (${id},${title.id},${title.ownerUserId},${title.ownerOrganizationId??null},${JSON.stringify(data.details)}::jsonb,${nextStatus},${actor.userId})
        on conflict (title_id) do update set
          details=excluded.details,
          submission_status=${nextStatus},
          submitted_at=null,
          submitted_by=null,
          updated_by=excluded.updated_by,
          updated_at=now()
      `;
      await writeAudit({actorUserId:actor.userId,action:"title.owner_submission_saved",entityType:"bridge_title",entityId:title.id,metadata:{submissionStatus:nextStatus}},tx);
    });
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
      const rows=await tx<{details:unknown; owner_user_id:string; owner_organization_id:string|null; submission_status:string}> `
        select details, owner_user_id, owner_organization_id, submission_status
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
      const transition = ownerSubmissionSubmitTransition(row.submission_status);
      const details=detailsSchema.parse(row.details);
      completeDetails(details);
      await tx `
        update bridge_title_owner_submissions set
          submission_status='SUBMITTED',submitted_at=now(),submitted_by=${actor.userId},
          updated_by=${actor.userId},updated_at=now()
        where title_id=${title.id}
      `;
      await tx `
        insert into bridge_owner_submission_events
          (title_id,submission_kind,action,from_status,to_status,actor_user_id)
        values (${title.id},'finished_film',${transition.action},${row.submission_status},'SUBMITTED',${actor.userId})
      `;
      await writeAudit({actorUserId:actor.userId,action:`title.owner_submission_${transition.action.toLowerCase()}`,entityType:"bridge_title",entityId:title.id,metadata:{titleStatus:title.status,from:row.submission_status,to:"SUBMITTED"}},tx);
    });
    // Owner details submission is intentionally separate from title QC,
    // rights review, legal approval, licensing and publication state.
    return {submitted:true as const,titleStatus:title.status};
  });

/** Super Admin-only combined queue; accepting a package does not advance title/QC state. */
export const listOwnerSubmissionQueue = createServerFn({method:"GET"})
  .middleware([authMiddleware])
  .handler(async ({context}) => {
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    const sql=await getSql();
    const finished=await sql<any>`
      select 'finished_film' as submission_kind,s.title_id,t.name as title_name,t.status as title_status,
        t.owner_account_type,s.owner_user_id,p.email as owner_email,p.display_name as owner_display_name,
        s.owner_organization_id,o.legal_name as owner_organization_name,s.details,
        s.submission_status as submission_status,s.submitted_at,
        (select count(*)::int from bridge_title_document_links l where l.title_id=t.id) as document_count
      from bridge_title_owner_submissions s
      join bridge_titles t on t.id=s.title_id
      left join bridge_profiles p on p.user_id=s.owner_user_id
      left join bridge_organizations o on o.id=s.owner_organization_id
      where s.submission_status='SUBMITTED'
      order by s.submitted_at asc nulls last
      limit 200
    `;
    const concepts=await sql<any>`
      select 'story_concept' as submission_kind,c.title_id,t.name as title_name,t.status as title_status,
        t.owner_account_type,t.owner_user_id,p.email as owner_email,p.display_name as owner_display_name,
        t.owner_organization_id,o.legal_name as owner_organization_name,
        jsonb_build_object('logline',c.logline,'synopsis',c.synopsis,'genre',c.genre,
          'estimatedBudgetRange',c.estimated_budget_range,'targetPlatforms',c.target_platforms,
          'treatmentUrl',c.treatment_url,'screenplayUrl',c.screenplay_url) as details,
        c.owner_submission_status as submission_status,
        (select e.created_at from bridge_owner_submission_events e
          where e.title_id=c.title_id and e.action in ('SUBMITTED','RESUBMITTED')
          order by e.created_at desc limit 1) as submitted_at,
        (select count(*)::int from bridge_title_document_links l where l.title_id=t.id) as document_count
      from bridge_story_concept_submissions c
      join bridge_titles t on t.id=c.title_id
      left join bridge_profiles p on p.user_id=t.owner_user_id
      left join bridge_organizations o on o.id=t.owner_organization_id
      where c.owner_submission_status='SUBMITTED'
      order by c.created_at asc
      limit 200
    `;
    return {submissions:[...finished,...concepts].sort((a,b)=>{
      const left=a.submitted_at?new Date(a.submitted_at).getTime():0;
      const right=b.submitted_at?new Date(b.submitted_at).getTime():0;
      return left-right;
    })};
  });

export const reviewOwnerSubmission = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator(z.object({
    titleId:z.string().min(8),
    submissionKind:z.enum(["finished_film","story_concept"]),
    decision:z.enum(["ACCEPTED_INTAKE","REQUEST_CHANGES","REJECTED"]),
    reason:z.string().trim().min(3).max(2000),
  }))
  .handler(async ({context,data})=>{
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    if(actor.internalRole!=="super_admin") throw new Error("Super Admin access required");
    const sql=await getSql();
    const reason=assertSubmissionDecisionReason(data.reason);
    let qcQueued=false;
    await sql.transaction(async(tx)=>{
      const titleRows=await tx<{id:string;status:string}> `
        select id,status from bridge_titles where id=${data.titleId} for update
      `;
      const lockedTitle=titleRows[0];
      if(!lockedTitle) throw new Error("Title not found");
      const currentRows=data.submissionKind==="finished_film"
        ? await tx<{status:string}>`
            select submission_status as status from bridge_title_owner_submissions
            where title_id=${data.titleId} for update
          `
        : await tx<{status:string}>`
            select owner_submission_status as status from bridge_story_concept_submissions
            where title_id=${data.titleId} for update
          `;
      const current=currentRows[0]?.status;
      const transition=ownerSubmissionReviewTransition(current??"",data.decision);
      const nextStatus=transition.toStatus;
      if(data.submissionKind==="finished_film"){
        if(data.decision==="ACCEPTED_INTAKE" && ["PREPARING","QC_REVIEW"].includes(lockedTitle.status)){
          const title=await loadTitle(data.titleId);
          if(!title) throw new Error("Title not found");
          if (lockedTitle.status === "PREPARING") {
            await submitTitleForQcInTransaction(tx,title,actor.userId,"Owner submission accepted into Technical QC queue");
          }
          qcQueued=true;
        }
        await tx`
          update bridge_title_owner_submissions set submission_status=${nextStatus},
            updated_by=${actor.userId},updated_at=now()
          where title_id=${data.titleId} and submission_status='SUBMITTED'
        `;
      } else {
        await tx`
          update bridge_story_concept_submissions set owner_submission_status=${nextStatus},updated_at=now()
          where title_id=${data.titleId} and owner_submission_status='SUBMITTED'
        `;
      }
      await tx`
        insert into bridge_owner_submission_events
          (title_id,submission_kind,action,from_status,to_status,actor_user_id,reason)
        values (${data.titleId},${data.submissionKind},${data.decision},'SUBMITTED',${nextStatus},${actor.userId},${reason})
      `;
      await writeAudit({
        actorUserId:actor.userId,
        action:data.decision==="ACCEPTED_INTAKE"?"title.owner_submission.accepted_intake":data.decision==="REJECTED"?"title.owner_submission.rejected":"title.owner_submission.request_changes",
        entityType:"bridge_title",entityId:data.titleId,
        metadata:{
          submissionKind:data.submissionKind,from:"SUBMITTED",to:nextStatus,reason,
          qcQueueEntered:qcQueued,qcApprovalGranted:false,rightsAndPublicationUnchanged:true,
        },
      },tx);
    });
    return {updated:true as const,status:data.decision==="ACCEPTED_INTAKE"?"ACCEPTED_INTAKE":data.decision==="REJECTED"?"REJECTED":"NEEDS_CORRECTION",qcQueued};
  });

/** Owner withdrawal is available only while this owner's submission is pending. */
export const withdrawOwnerSubmission = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator(z.object({titleId:z.string().min(8),submissionKind:z.enum(["finished_film","story_concept"]),reason:z.string().trim().min(3).max(2000)}))
  .handler(async ({context,data})=>{
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    const reason=assertSubmissionDecisionReason(data.reason);
    const sql=await getSql();
    await sql.transaction(async(tx)=>{
      const titleRows=await tx<{id:string;owner_user_id:string;owner_account_type:string;owner_organization_id:string|null}> `
        select id,owner_user_id,owner_account_type,owner_organization_id
        from bridge_titles where id=${data.titleId} for update
      `;
      const title=titleRows[0];
      if(!title) throw new Error("Title not found");
      if(actor.internalRole || !["independent_creator","studio"].includes(actor.accountType)) {
        throw new Error("Creator or Studio owner access required");
      }
      const ownsDirectly=title.owner_user_id===actor.userId;
      const ownsThroughStudio=title.owner_account_type==="studio" && Boolean(title.owner_organization_id)
        && title.owner_organization_id===actor.organizationId;
      if(!ownsDirectly && !ownsThroughStudio) throw new Error("You cannot withdraw another owner's submission");
      if (ownsThroughStudio) {
        const membership = await tx<{ active: boolean }>`
          select exists (
            select 1 from bridge_organization_memberships
            where organization_id=${title.owner_organization_id}
              and user_id=${actor.userId}
              and status='active'
          ) as active
        `;
        if (!membership[0]?.active) throw new Error("Active Studio organization membership is required");
      }
      let current:string|undefined;
      if(data.submissionKind==="finished_film") {
        const rows=await tx<{status:string}> `
          select submission_status as status from bridge_title_owner_submissions
          where title_id=${data.titleId} for update
        `;
        current=rows[0]?.status;
      } else {
        const rows=await tx<{status:string}> `
          select owner_submission_status as status from bridge_story_concept_submissions
          where title_id=${data.titleId} for update
        `;
        current=rows[0]?.status;
      }
      const transition=ownerSubmissionWithdrawTransition(current??"");
      if(data.submissionKind==="finished_film") {
        await tx `
          update bridge_title_owner_submissions set submission_status='WITHDRAWN',updated_by=${actor.userId},updated_at=now()
          where title_id=${data.titleId} and submission_status='SUBMITTED'
        `;
      } else {
        await tx `
          update bridge_story_concept_submissions set owner_submission_status='WITHDRAWN',updated_at=now()
          where title_id=${data.titleId} and owner_submission_status='SUBMITTED'
        `;
      }
      await tx `
        insert into bridge_owner_submission_events
          (title_id,submission_kind,action,from_status,to_status,actor_user_id,reason)
        values (${data.titleId},${data.submissionKind},${transition.action},${transition.fromStatus},${transition.toStatus},${actor.userId},${reason})
      `;
      await writeAudit({
        actorUserId:actor.userId,action:"title.owner_submission.withdrawn",entityType:"bridge_title",entityId:data.titleId,
        metadata:{submissionKind:data.submissionKind,from:transition.fromStatus,to:transition.toStatus,reason,organizationId:actor.organizationId??null},
      },tx);
    });
    return {withdrawn:true as const,status:"WITHDRAWN" as const};
  });

/** Super Admin may archive a submission record without deleting its history or title. */
export const archiveOwnerSubmission = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator(z.object({
    titleId:z.string().min(8),
    submissionKind:z.enum(["finished_film","story_concept"]),
    reason:z.string().trim().min(3).max(2000),
  }))
  .handler(async ({context,data})=>{
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    if(actor.internalRole!=="super_admin") throw new Error("Super Admin access required");
    const reason=assertSubmissionDecisionReason(data.reason);
    const sql=await getSql();
    await sql.transaction(async(tx)=>{
      const titleRows=await tx<{id:string}> \`
        select id from bridge_titles where id=\${data.titleId} for update
      \`;
      if(!titleRows[0]) throw new Error("Title not found");
      const currentRows=data.submissionKind==="finished_film"
        ? await tx<{status:string}>\`
            select submission_status as status from bridge_title_owner_submissions
            where title_id=\${data.titleId} for update
          \`
        : await tx<{status:string}>\`
            select owner_submission_status as status from bridge_story_concept_submissions
            where title_id=\${data.titleId} for update
          \`;
      const current=currentRows[0]?.status;
      if(!current || current==="ACCEPTED_INTAKE" || current==="ARCHIVED") {
        throw new Error("Only an existing, non-accepted submission can be archived");
      }
      if(data.submissionKind==="finished_film") {
        await tx\`
          update bridge_title_owner_submissions set submission_status='ARCHIVED',
            updated_by=\${actor.userId},updated_at=now()
          where title_id=\${data.titleId}
        \`;
      } else {
        await tx\`
          update bridge_story_concept_submissions set owner_submission_status='ARCHIVED',updated_at=now()
          where title_id=\${data.titleId}
        \`;
      }
      await tx\`
        insert into bridge_owner_submission_events
          (title_id,submission_kind,action,from_status,to_status,actor_user_id,reason)
        values (\${data.titleId},\${data.submissionKind},'ARCHIVED',\${current},'ARCHIVED',\${actor.userId},\${reason})
      \`;
      await writeAudit({
        actorUserId:actor.userId,action:"title.owner_submission.archived",
        entityType:"bridge_title",entityId:data.titleId,
        metadata:{submissionKind:data.submissionKind,from:current,to:"ARCHIVED",reason},
      },tx);
    });
    return {archived:true as const,status:"ARCHIVED" as const};
  });

