import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { canMutateTitle } from "./rbac";
import { writeAudit } from "./audit";

const kindSchema = z.enum(["finished_film", "story_concept"]);
const payloadSchema = z.object({
  titleId: z.string().min(8),
  submissionKind: kindSchema,
  details: z.record(z.string(), z.unknown()),
  submit: z.boolean().default(false),
});

export const saveOwnerSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(payloadSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["studio", "independent_creator"].includes(actor.accountType)) throw new Error("Owner account required");
    if (!canMutateTitle(actor, { ownerUserId: actor.userId, ownerAccountType: actor.accountType, ownerOrganizationId: actor.organizationId }, "title.update_own", "title.license")) throw new Error("Forbidden");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const titleRows = await tx<{ id: string; owner_user_id: string; owner_account_type: string; owner_organization_id: string | null; submission_type: string; status: string }>`
        select id, owner_user_id, owner_account_type, owner_organization_id, submission_type, status
        from bridge_titles where id = ${data.titleId} for update
      `;
      const title = titleRows[0];
      if (!title || title.owner_user_id !== actor.userId && !(actor.accountType === "studio" && title.owner_account_type === "studio" && actor.organizationId && title.owner_organization_id === actor.organizationId)) throw new Error("Not found");
      if (title.submission_type !== data.submissionKind) throw new Error("Submission type mismatch");
      if (!["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)) throw new Error("Title is locked after preparation");
      const existingRows = await tx<{ id: string; submission_status: string }>`
        select id, submission_status from bridge_title_owner_submissions where title_id = ${data.titleId} for update
      `;
      const existing = existingRows[0];
      if (existing && !["DRAFT", "NEEDS_CORRECTION"].includes(existing.submission_status)) throw new Error("Submission is locked after intake");
      const nextStatus = data.submit ? "SUBMITTED" : existing?.submission_status ?? "DRAFT";
      if (existing) {
        await tx`update bridge_title_owner_submissions set details = ${JSON.stringify(data.details)}::jsonb, submission_status = ${nextStatus}, submitted_at = case when ${data.submit} then now() else submitted_at end, submitted_by = case when ${data.submit} then ${actor.userId} else submitted_by end, updated_by = ${actor.userId}, updated_at = now() where id = ${existing.id}`;
      } else {
        await tx`insert into bridge_title_owner_submissions (id,title_id,owner_user_id,owner_organization_id,details,submission_status,submitted_at,submitted_by,updated_by) values (${randomUUID()},${data.titleId},${actor.userId},${actor.organizationId ?? null},${JSON.stringify(data.details)}::jsonb,${nextStatus},case when ${data.submit} then now() else null end,case when ${data.submit} then ${actor.userId} else null end,${actor.userId})`;
      }
      if (data.submit) {
        await tx`insert into bridge_owner_submission_events (title_id,submission_kind,action,from_status,to_status,actor_user_id,reason) values (${data.titleId},${data.submissionKind},case when ${existing?.submission_status === "NEEDS_CORRECTION"} then 'RESUBMITTED' else 'SUBMITTED' end,${existing?.submission_status ?? "DRAFT"},'SUBMITTED',${actor.userId},'Owner submitted canonical submission')`;
      }
      await tx`update bridge_titles set name = case when ${data.details.name !== undefined || data.details.titleName !== undefined} then coalesce(nullif(${String(data.details.name ?? data.details.titleName ?? "")}, ''), name) else name end, synopsis = case when ${data.details.synopsis !== undefined} then coalesce(nullif(${String(data.details.synopsis ?? "")}, ''), synopsis) else synopsis end, language = case when ${data.details.language !== undefined} then coalesce(nullif(${String(data.details.language ?? "")}, ''), language) else language end, updated_at = now() where id = ${data.titleId}`;
      if (data.submissionKind === "story_concept") {
        await tx`update bridge_story_concept_submissions set logline = coalesce(nullif(${String(data.details.logline ?? "")}, ''), logline), synopsis = coalesce(nullif(${String(data.details.synopsis ?? "")}, ''), synopsis), treatment_url = case when ${data.details.treatmentUrl !== undefined} then nullif(${String(data.details.treatmentUrl ?? "")}, '') else treatment_url end, screenplay_url = case when ${data.details.screenplayUrl !== undefined} then nullif(${String(data.details.screenplayUrl ?? "")}, '') else screenplay_url end, genre = case when ${Array.isArray(data.details.genre)} then ${JSON.stringify(data.details.genre)}::jsonb else to_jsonb(genre) end, estimated_budget_range = case when ${data.details.estimatedBudgetRange !== undefined} then nullif(${String(data.details.estimatedBudgetRange ?? "")}, '') else estimated_budget_range end, target_platforms = case when ${Array.isArray(data.details.targetPlatforms)} then ${JSON.stringify(data.details.targetPlatforms)}::jsonb else to_jsonb(target_platforms) end, owner_submission_status = ${nextStatus}, updated_at = now() where title_id = ${data.titleId}`;
      }
      await writeAudit({ actorUserId: actor.userId, action: data.submit ? "owner_submission.submitted" : "owner_submission.draft_saved", entityType: "bridge_title_owner_submission", entityId: data.titleId, metadata: { submissionKind: data.submissionKind, status: nextStatus } }, tx);
      return { titleId: data.titleId, submissionStatus: nextStatus };
    });
  });

export const listMyEditableOwnerSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["studio", "independent_creator"].includes(actor.accountType)) throw new Error("Owner account required");
    const sql = await getSql();
    const rows = await sql<{ id: string; title_id: string; details: unknown; submission_status: string; submission_type: string; title_name: string; updated_at: string }>`
      select s.id, s.title_id, s.details, s.submission_status, t.submission_type, t.name as title_name, s.updated_at
      from bridge_title_owner_submissions s join bridge_titles t on t.id = s.title_id
      where s.submission_status in ('DRAFT', 'NEEDS_CORRECTION')
        and t.submission_type in ('finished_film', 'story_concept')
        and (t.owner_user_id = ${actor.userId} or (actor.accountType = "studio" and t.owner_account_type = "studio" and t.owner_organization_id = ${actor.organizationId ?? null} and exists (select 1 from bridge_organization_memberships m where m.organization_id = t.owner_organization_id and m.user_id = ${actor.userId} and m.status = "active")))
      order by s.updated_at desc limit 100
    `;
    return { submissions: rows.map(row => ({ ...row, details: row.details ?? {} })) };
  });
export const listOwnerSubmissionIntake = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    const sql = await getSql();
    const rows = await sql<{
      id: string; title_id: string; owner_user_id: string; owner_organization_id: string | null;
      details: unknown; submission_status: string; submitted_at: string | null; updated_at: string;
      title_name: string; submission_type: string; owner_name: string | null; owner_email: string | null;
    }>`
      select s.id, s.title_id, s.owner_user_id, s.owner_organization_id, s.details,
             s.submission_status, s.submitted_at, s.updated_at, t.name as title_name,
             t.submission_type, p.display_name as owner_name, p.email as owner_email
      from bridge_title_owner_submissions s
      join bridge_titles t on t.id = s.title_id
      join bridge_profiles p on p.user_id = s.owner_user_id
      where s.submission_status in ('SUBMITTED','NEEDS_CORRECTION','ACCEPTED_INTAKE','REJECTED')
      order by s.submitted_at desc nulls last, s.updated_at desc
      limit 300
    `;
    return { submissions: rows.map(row => ({ ...row, details: JSON.stringify(row.details ?? {}) })) };
  });

export const decideOwnerSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    action: z.enum(["ACCEPTED_INTAKE", "REQUEST_CHANGES", "REJECTED"]),
    reason: z.string().trim().min(5).max(2000),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const rows = await tx<{ id: string; submission_status: string; submission_type: string }>`
        select s.id, s.submission_status, t.submission_type
        from bridge_title_owner_submissions s join bridge_titles t on t.id=s.title_id
        where s.title_id=${data.titleId} for update of s
      `;
      const current = rows[0];
      if (!current || current.submission_status !== "SUBMITTED") throw new Error("Only submitted items can be decided");
      const next = data.action === "ACCEPTED_INTAKE" ? "ACCEPTED_INTAKE" : data.action === "REQUEST_CHANGES" ? "NEEDS_CORRECTION" : "REJECTED";
      await tx`update bridge_title_owner_submissions set submission_status=${next}, updated_by=${actor.userId}, updated_at=now() where id=${current.id}`;
      if (current.submission_type === "story_concept") {
        await tx`update bridge_story_concept_submissions set owner_submission_status = ${next}, updated_at = now() where title_id = ${data.titleId}`;
      }
      await tx`insert into bridge_owner_submission_events (title_id,submission_kind,action,from_status,to_status,actor_user_id,reason) values (${data.titleId},${current.submission_type},${data.action},'SUBMITTED',${next},${actor.userId},${data.reason})`;
      await writeAudit({ actorUserId: actor.userId, action: "owner_submission." + data.action.toLowerCase(), entityType: "bridge_title_owner_submission", entityId: data.titleId, metadata: { from: "SUBMITTED", to: next, reason: data.reason } }, tx);
      return { titleId: data.titleId, submissionStatus: next };
    });
  });
