import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

const productionType = z.enum(["FEATURE", "SHORT", "SERIES", "DOCUMENTARY", "OTHER"]);
const lifecycle = z.enum(["PRE_PRODUCTION", "IN_PRODUCTION", "WRAP", "POST_PRODUCTION", "COMPLETED", "ON_HOLD"]);
const eventType = z.enum(["PRE_PRODUCTION", "SHOOT_DAY", "WRAP", "DIT_HANDOFF", "POST_PRODUCTION", "DELIVERY", "MILESTONE", "OTHER"]);

async function requireStudioMembership(userId: string, write = false) {
  const actor = await requireVerifiedActor(userId);
  if (actor.accountType !== "studio" || !actor.organizationId || actor.internalRole) {
    throw new Error("Verified Studio organization access is required");
  }
  const sql = await getSql();
  const rows = await sql<{ membership_role: string }>`
    select membership_role
    from bridge_organization_memberships
    where organization_id = ${actor.organizationId}
      and user_id = ${actor.userId}
      and status = 'active'
    limit 1
  `;
  const allowed = write ? ["owner", "admin", "producer"] : ["owner", "admin", "producer", "dit", "member"];
  if (!rows[0] || !allowed.includes(rows[0].membership_role)) {
    throw new Error(write ? "An active Studio owner, admin or producer membership is required" : "Active Studio membership is required");
  }
  return actor;
}

function assertLifecycleTransition(from: string, to: string) {
  const allowed: Record<string, string[]> = {
    PRE_PRODUCTION: ["IN_PRODUCTION", "ON_HOLD"],
    IN_PRODUCTION: ["WRAP", "ON_HOLD"],
    WRAP: ["IN_PRODUCTION", "POST_PRODUCTION", "ON_HOLD"],
    POST_PRODUCTION: ["COMPLETED", "ON_HOLD"],
    ON_HOLD: ["PRE_PRODUCTION", "IN_PRODUCTION", "WRAP", "POST_PRODUCTION"],
    COMPLETED: [],
  };
  if (!allowed[from]?.includes(to)) {
    throw new Error(`Invalid production lifecycle transition: ${from} → ${to}`);
  }
}

const projectInput = z.object({
  name: z.string().trim().min(2).max(180),
  projectCode: z.string().trim().max(48).optional(),
  productionType,
  plannedStartDate: z.string().date().optional(),
  plannedEndDate: z.string().date().optional(),
  primaryLocation: z.string().trim().max(240).optional(),
}).superRefine((value, ctx) => {
  if (value.plannedStartDate && value.plannedEndDate && value.plannedEndDate < value.plannedStartDate) {
    ctx.addIssue({ code: "custom", path: ["plannedEndDate"], message: "Planned end must not precede planned start" });
  }
});

export const getProductionWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireStudioMembership(context.userId);
    const sql = await getSql();
    const [projects, shootDays, events, crew, finishedFilms] = await Promise.all([
      sql`select id, name, project_code, production_type, status, planned_start_date::text,
        planned_end_date::text, primary_location, created_at, updated_at
        from bridge_production_projects
        where organization_id = ${actor.organizationId}
        order by updated_at desc limit 100`,
      sql`select d.id, d.project_id, d.shoot_date::text, d.day_label, d.location, d.notes
        from bridge_production_shoot_days d
        join bridge_production_projects p on p.id = d.project_id
        where p.organization_id = ${actor.organizationId}
        order by d.shoot_date asc limit 500`,
      sql`select e.id, e.project_id, e.title_id, e.event_type, e.event_name,
        e.starts_at, e.ends_at, e.location, e.notes, e.status
        from bridge_production_schedule_events e
        where e.organization_id = ${actor.organizationId}
        order by e.starts_at asc limit 500`,
      sql`select c.id, c.project_id, c.full_name, c.role, c.department, c.notes, c.status
        from bridge_production_project_crew c
        where c.organization_id = ${actor.organizationId}
        order by c.full_name asc limit 1000`,
      sql`select id, name, status
        from bridge_titles
        where owner_account_type = 'studio'
          and owner_organization_id = ${actor.organizationId}
          and submission_type = 'finished_film'
          and merged_into_title_id is null
          and record_classification is distinct from 'TEST'
          and coalesce(external_ids->>'test_only', 'false') <> 'true'
        order by updated_at desc limit 200`,
    ]);
    return {
      organizationId: actor.organizationId,
      projects: projects.map((p) => ({ ...p, plannedStartDate: p.planned_start_date, plannedEndDate: p.planned_end_date })),
      shootDays: shootDays.map((d) => ({ ...d, shootDate: d.shoot_date })),
      events,
      crew,
      finishedFilms,
    };
  });

export const createProductionProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(projectInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireStudioMembership(context.userId, true);
    const sql = await getSql();
    const id = randomUUID();
    await sql.transaction(async (tx) => {
      await tx`insert into bridge_production_projects
        (id, organization_id, name, project_code, production_type, status,
         planned_start_date, planned_end_date, primary_location, created_by, updated_by)
        values (${id}::uuid, ${actor.organizationId}, ${data.name}, ${data.projectCode || null},
          ${data.productionType}, 'PRE_PRODUCTION', ${data.plannedStartDate || null},
          ${data.plannedEndDate || null}, ${data.primaryLocation || null}, ${actor.userId}, ${actor.userId})`;
      await writeAudit({ actorUserId: actor.userId, action: "production.project.create",
        entityType: "bridge_production_project", entityId: id, metadata: { productionType: data.productionType } }, tx);
    });
    return { projectId: id, status: "PRE_PRODUCTION" as const };
  });

export const updateProductionLifecycle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ projectId: z.string().uuid(), status: lifecycle }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireStudioMembership(context.userId, true);
    const sql = await getSql();
    await sql.transaction(async (tx) => {
      const rows = await tx<{ status: string }>`select status from bridge_production_projects
        where id = ${data.projectId}::uuid and organization_id = ${actor.organizationId} for update`;
      if (!rows[0]) throw new Error("Production project not found in this Studio");
      assertLifecycleTransition(rows[0].status, data.status);
      await tx`update bridge_production_projects set status = ${data.status},
        updated_by = ${actor.userId}, updated_at = now()
        where id = ${data.projectId}::uuid and organization_id = ${actor.organizationId}`;
      await writeAudit({ actorUserId: actor.userId, action: "production.project.lifecycle",
        entityType: "bridge_production_project", entityId: data.projectId,
        metadata: { from: rows[0].status, to: data.status } }, tx);
    });
    return { projectId: data.projectId, status: data.status };
  });

export const createProductionShootDay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    projectId: z.string().uuid(), shootDate: z.string().date(),
    dayLabel: z.string().trim().max(120).optional(),
    location: z.string().trim().max(240).optional(),
    notes: z.string().trim().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireStudioMembership(context.userId, true);
    const sql = await getSql();
    const id = randomUUID();
    await sql.transaction(async (tx) => {
      const project = await tx<{ id: string }>`select id from bridge_production_projects
        where id = ${data.projectId}::uuid and organization_id = ${actor.organizationId} limit 1`;
      if (!project[0]) throw new Error("Production project not found in this Studio");
      await tx`insert into bridge_production_shoot_days
        (id, project_id, shoot_date, day_label, location, notes, created_by, updated_by)
        values (${id}::uuid, ${data.projectId}::uuid, ${data.shootDate},
          ${data.dayLabel || null}, ${data.location || null}, ${data.notes || null},
          ${actor.userId}, ${actor.userId})`;
      await writeAudit({ actorUserId: actor.userId, action: "production.shoot_day.create",
        entityType: "bridge_production_shoot_day", entityId: id, metadata: { projectId: data.projectId, shootDate: data.shootDate } }, tx);
    });
    return { shootDayId: id };
  });

export const createProductionScheduleEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    projectId: z.string().uuid(), eventType, eventName: z.string().trim().min(1).max(180),
    startsAt: z.string().datetime(), endsAt: z.string().datetime(),
    location: z.string().trim().max(240).optional(), notes: z.string().trim().max(4000).optional(),
  }).superRefine((v, ctx) => {
    if (new Date(v.endsAt) <= new Date(v.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireStudioMembership(context.userId, true);
    const sql = await getSql();
    const id = randomUUID();
    await sql.transaction(async (tx) => {
      const project = await tx<{ id: string }>`select id from bridge_production_projects
        where id = ${data.projectId}::uuid and organization_id = ${actor.organizationId} limit 1`;
      if (!project[0]) throw new Error("Production project not found in this Studio");
      await tx`insert into bridge_production_schedule_events
        (id, organization_id, project_id, title_id, event_type, event_name, starts_at, ends_at,
         location, notes, status, created_by, updated_by)
        values (${id}::uuid, ${actor.organizationId}, ${data.projectId}::uuid, null,
          ${data.eventType}, ${data.eventName}, ${data.startsAt}, ${data.endsAt},
          ${data.location || null}, ${data.notes || null}, 'SCHEDULED', ${actor.userId}, ${actor.userId})`;
      await writeAudit({ actorUserId: actor.userId, action: "production.schedule_event.create",
        entityType: "bridge_production_schedule_event", entityId: id,
        metadata: { projectId: data.projectId, eventType: data.eventType } }, tx);
    });
    return { eventId: id };
  });

export const createProductionCrewMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    projectId: z.string().uuid(), fullName: z.string().trim().min(2).max(160),
    role: z.string().trim().min(2).max(120), department: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireStudioMembership(context.userId, true);
    const sql = await getSql();
    const id = randomUUID();
    await sql.transaction(async (tx) => {
      const project = await tx<{ id: string }>`select id from bridge_production_projects
        where id = ${data.projectId}::uuid and organization_id = ${actor.organizationId} limit 1`;
      if (!project[0]) throw new Error("Production project not found in this Studio");
      await tx`insert into bridge_production_project_crew
        (id, project_id, organization_id, full_name, role, department, notes, created_by, updated_by)
        values (${id}::uuid, ${data.projectId}::uuid, ${actor.organizationId},
          ${data.fullName}, ${data.role}, ${data.department || null}, ${data.notes || null},
          ${actor.userId}, ${actor.userId})`;
      await writeAudit({ actorUserId: actor.userId, action: "production.crew.create",
        entityType: "bridge_production_project_crew", entityId: id, metadata: { projectId: data.projectId, role: data.role } }, tx);
    });
    return { crewMemberId: id };
  });

export const linkProductionFinishedFilm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ projectId: z.string().uuid(), titleId: z.string().min(8).max(160) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireStudioMembership(context.userId, true);
    const sql = await getSql();
    const id = randomUUID();
    await sql.transaction(async (tx) => {
      const project = await tx<{ id: string; status: string }>`select id, status
        from bridge_production_projects where id = ${data.projectId}::uuid
          and organization_id = ${actor.organizationId} for update`;
      if (!project[0]) throw new Error("Production project not found in this Studio");
      if (project[0].status !== "COMPLETED") throw new Error("Finished Film handoff is allowed only after Production is COMPLETED");
      const title = await tx<{ id: string }>`select id from bridge_titles
        where id = ${data.titleId} and owner_account_type = 'studio'
          and owner_organization_id = ${actor.organizationId}
          and submission_type = 'finished_film' and merged_into_title_id is null
          and record_classification is distinct from 'TEST'
          and coalesce(external_ids->>'test_only', 'false') <> 'true'
        limit 1`;
      if (!title[0]) throw new Error("Finished Film submission not found in this Studio");
      await tx`insert into bridge_production_title_links
        (id, production_project_id, title_id, link_type, created_by)
        values (${id}::uuid, ${data.projectId}::uuid, ${data.titleId}, 'FINISHED_FILM_OUTPUT', ${actor.userId})
        on conflict (production_project_id, title_id, link_type) do nothing`;
      await writeAudit({ actorUserId: actor.userId, action: "production.finished_film.link",
        entityType: "bridge_production_project", entityId: data.projectId,
        metadata: { titleId: data.titleId, linkId: id } }, tx);
    });
    return { projectId: data.projectId, titleId: data.titleId, linked: true as const };
  });
