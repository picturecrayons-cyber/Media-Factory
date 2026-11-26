import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

async function verifiedActor(userId: string) {
  assertNotDevUser(userId);
  return requireVerifiedActor(userId);
}

const legalDecisionInput = z.object({
  titleId: z.string().min(8),
  legalCaseId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT", "ACTION_REQUIRED"]),
  note: z.string().trim().min(8).max(2000),
});

export const decideIndependentLegalCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(legalDecisionInput)
  .handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId);
    // Legal approval must be performed by a designated Legal Reviewer,
    // not by the rights approver or a general administrator.
    if (actor.internalRole !== "legal_reviewer") throw new Error("Independent Legal Reviewer role required");
    assertPermission(actor, "title.rights_review");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [title] = await tx<{ id: string; status: string }>`
        select id,status from bridge_titles where id=${data.titleId} for update
      `;
      if (!title || title.status !== "RIGHTS_REVIEW") throw new Error("Title is not awaiting Legal review");
      const [legalCase] = await tx<{
        id: string; status: string; evidence: unknown; rights_grant_id: string | null;
      }>`
        select id,status,evidence,rights_grant_id from bridge_legal_cases
        where id=${data.legalCaseId} and title_id=${data.titleId} for update
      `;
      if (!legalCase || !["PENDING","IN_REVIEW","ACTION_REQUIRED"].includes(legalCase.status)) {
        throw new Error("Legal case is not available for an independent decision");
      }
      const evidence = Array.isArray(legalCase.evidence) ? legalCase.evidence : [];
      if (data.decision === "APPROVE" && evidence.length === 0) {
        throw new Error("Legal approval requires recorded supporting evidence");
      }
      const grantId = legalCase.rights_grant_id ??
        (evidence as Array<Record<string, unknown>>).map((item) => item.grantId).find((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) as string | undefined;
      if (!grantId) throw new Error("Legal case must identify the rights grant under review");
      const [grant] = await tx<{ id: string; created_by: string; status: string }>`
        select id,created_by,status from bridge_rights_grants
        where id=${grantId}::uuid and title_id=${data.titleId} for update
      `;
      if (!grant || !["DRAFT","VALID"].includes(grant.status)) throw new Error("Linked rights grant is unavailable");
      if (grant.created_by === actor.userId) throw new Error("A reviewer cannot independently approve their own rights submission");
      const nextStatus = data.decision === "APPROVE" ? "APPROVED" :
        data.decision === "REJECT" ? "REJECTED" : "ACTION_REQUIRED";
      const decisionEvidence = [...evidence, {
        grantId, decision: data.decision, note: data.note, reviewerUserId: actor.userId,
        decidedAt: new Date().toISOString(),
      }];
      await tx`
        update bridge_legal_cases
        set status=${nextStatus}, rights_grant_id=${grantId}::uuid,
            evidence=${JSON.stringify(decisionEvidence)}::jsonb,
            reviewed_by=${actor.userId}, reviewed_at=now()
        where id=${legalCase.id}
      `;
      await tx`
        insert into bridge_title_events(title_id,from_status,to_status,actor_user_id,note)
        values (${data.titleId},${title.status},${title.status},${actor.userId},${"Independent Legal " + data.decision + ": " + data.note})
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "legal.independent." + data.decision.toLowerCase(),
        entityType: "bridge_legal_case",
        entityId: legalCase.id,
        metadata: { titleId: data.titleId, rightsGrantId: grantId, note: data.note },
      }, tx);
      return { ok: true, status: nextStatus, rightsGrantId: grantId };
    });
  });

const taskCreateInput = z.object({
  titleId: z.string().min(8).optional(),
  taskType: z.enum(["QC_REVIEW","LEGAL_REVIEW","RIGHTS_REVIEW","ASSET_VERIFICATION","MIGRATION_RECONCILIATION","PRODUCTION_CLASSIFICATION","GENERAL"]),
  assignedRole: z.enum(["admin","super_admin","qc_reviewer","legal_reviewer","finance","viewer"]),
  priority: z.enum(["LOW","NORMAL","HIGH","URGENT"]).default("NORMAL"),
  summary: z.string().trim().min(1).max(500),
  details: z.record(z.string(), z.unknown()).default({}),
  dueAt: z.string().datetime().optional(),
});

export const createInternalTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(taskCreateInput)
  .handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId);
    if (!["admin","super_admin"].includes(actor.internalRole ?? "")) throw new Error("Admin role required to create tasks");
    const sql = await getSql();
    const [task] = await sql<{ id: string }>`
      insert into bridge_internal_tasks(title_id,task_type,assigned_role,status,priority,summary,details,due_at,created_by)
      values (${data.titleId ?? null},${data.taskType},${data.assignedRole},'OPEN',${data.priority},
        ${data.summary},${JSON.stringify(data.details)}::jsonb,${data.dueAt ?? null},${actor.userId})
      returning id
    `;
    await writeAudit({ actorUserId: actor.userId, action: "internal_task.create", entityType: "bridge_internal_task", entityId: task.id, metadata: { taskType: data.taskType, assignedRole: data.assignedRole } });
    return { taskId: task.id };
  });

export const listInternalTasks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await verifiedActor(context.userId);
    if (!["admin","super_admin","qc_reviewer","legal_reviewer","finance","viewer"].includes(actor.internalRole ?? "")) {
      throw new Error("Internal role required");
    }
    const sql = await getSql();
    const tasks = actor.internalRole === "admin" || actor.internalRole === "super_admin"
      ? await sql`select id,title_id,task_type,assigned_role,assigned_user_id,status,priority,summary,details,due_at,created_at,updated_at,completed_at from bridge_internal_tasks order by case priority when 'URGENT' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end,created_at desc limit 300`
      : await sql`select id,title_id,task_type,assigned_role,assigned_user_id,status,priority,summary,details,due_at,created_at,updated_at,completed_at from bridge_internal_tasks where assigned_role=${actor.internalRole} or assigned_user_id=${actor.userId} order by case priority when 'URGENT' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end,created_at desc limit 200`;
    return JSON.parse(JSON.stringify(tasks, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

const taskUpdateInput = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["OPEN","IN_PROGRESS","BLOCKED","DONE","CANCELLED"]),
  note: z.string().trim().max(2000).optional(),
});

export const updateInternalTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(taskUpdateInput)
  .handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId);
    if (!actor.internalRole) throw new Error("Internal role required");
    const sql = await getSql();
    const [task] = await sql<{ id: string; assigned_role: string; assigned_user_id: string | null; status: string }>`
      select id,assigned_role,assigned_user_id,status from bridge_internal_tasks where id=${data.taskId} for update
    `;
    if (!task) throw new Error("Task not found");
    const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
    if (!isAdmin && task.assigned_role !== actor.internalRole && task.assigned_user_id !== actor.userId) throw new Error("Task is outside your assigned queue");
    if (actor.internalRole === "viewer" && data.status !== "OPEN") throw new Error("Viewer role is read-only");
    await sql`
      update bridge_internal_tasks
      set status=${data.status},updated_by=${actor.userId},updated_at=now(),
          completed_at=case when ${data.status}='DONE' then now() when ${data.status} in ('OPEN','IN_PROGRESS','BLOCKED') then null else completed_at end
      where id=${data.taskId}
    `;
    await writeAudit({ actorUserId: actor.userId, action: "internal_task." + data.status.toLowerCase(), entityType: "bridge_internal_task", entityId: data.taskId, metadata: { note: data.note ?? null, from: task.status, to: data.status } });
    return { ok: true, status: data.status };
  });

const classifyInput = z.object({
  titleId: z.string().min(8),
  classification: z.enum(["PRODUCTION","TEST","LEGACY","UNCLASSIFIED"]),
  reason: z.string().trim().min(8).max(2000),
});

export const classifyBridgeTitleRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(classifyInput)
  .handler(async ({ context, data }) => {
    const actor = await verifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin classification authority required");
    const sql = await getSql();
    const [previous] = await sql<{ record_classification: string }>`
      select record_classification from bridge_titles where id=${data.titleId} for update
    `;
    if (!previous) throw new Error("Title not found");
    await sql`update bridge_titles set record_classification=${data.classification},updated_at=now() where id=${data.titleId}`;
    await writeAudit({ actorUserId: actor.userId, action: "title.classification.set", entityType: "bridge_title", entityId: data.titleId, metadata: { from: previous.record_classification, to: data.classification, reason: data.reason } });
    return { ok: true, classification: data.classification };
  });
