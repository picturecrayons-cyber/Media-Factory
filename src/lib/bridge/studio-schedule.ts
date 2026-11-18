import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import {
  canManageStudioSchedule,
  canTransitionStudioScheduleStatus,
  isValidStudioScheduleWindow,
  type StudioScheduleEventType,
  type StudioScheduleStatus,
} from "./studio-schedule-policy";

export type StudioScheduleEvent = {
  id: string;
  titleId: string;
  titleName: string;
  eventType: StudioScheduleEventType;
  eventName: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  notes: string | null;
  status: StudioScheduleStatus;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

async function requireStudioScheduleMembership(userId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (actor.internalRole || actor.accountType !== "studio" || !actor.organizationId) {
    throw new Error("Verified Studio organization access is required");
  }
  const sql = await getSql();
  const rows = await sql<{ membership_role: string }>`
    select m.membership_role
    from bridge_organization_memberships m
    join bridge_organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = ${actor.organizationId}::uuid
      and m.user_id = ${actor.userId}
      and m.status = 'active'
    limit 1
  `;
  const role = rows[0]?.membership_role;
  if (!role || !["owner", "admin", "producer", "dit", "member"].includes(role)) {
    throw new Error("An active Studio organization membership is required");
  }
  return { actor, sql, role, canManage: canManageStudioSchedule(role) };
}

async function requireStudioScheduleTitle(
  sql: Awaited<ReturnType<typeof getSql>>,
  titleId: string,
  organizationId: string,
) {
  const rows = await sql<{ id: string; name: string }>`
    select t.id, t.name
    from bridge_titles t
    where t.id = ${titleId}
      and t.owner_account_type = 'studio'
      and (
        t.owner_organization_id = ${organizationId}::uuid
        or (
          t.owner_organization_id is null
          and exists (
            select 1 from bridge_profiles p
            where p.user_id = t.owner_user_id
              and p.account_type = 'studio'
              and p.organization_id = ${organizationId}::uuid
          )
        )
      )
    limit 1
  `;
  if (!rows[0]) throw new Error("Title is not owned by the active Studio organization");
  return rows[0];
}

const isoString = z.string().min(1).max(60).refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Enter a valid date and time",
);

const createInput = z.object({
  titleId: z.string().trim().min(1).max(160),
  eventType: z.enum(["PRE_PRODUCTION", "SHOOT_DAY", "WRAP", "DIT_HANDOFF", "POST_PRODUCTION", "DELIVERY", "OTHER"]),
  eventName: z.string().trim().min(1).max(180),
  startsAt: isoString,
  endsAt: isoString,
  location: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const listStudioScheduleEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ events: StudioScheduleEvent[]; canManage: boolean }> => {
    const { actor, sql, canManage } = await requireStudioScheduleMembership(context.userId);
    const rows = await sql<{
      id: string;
      title_id: string;
      title_name: string;
      event_type: string;
      event_name: string;
      starts_at: string | Date;
      ends_at: string | Date;
      location: string | null;
      notes: string | null;
      status: string;
      created_by: string;
      updated_by: string;
      created_at: string | Date;
      updated_at: string | Date;
    }>`
      select e.id, e.title_id, t.name as title_name, e.event_type, e.event_name,
        e.starts_at, e.ends_at, e.location, e.notes, e.status, e.created_by,
        e.updated_by, e.created_at, e.updated_at
      from bridge_production_schedule_events e
      join bridge_titles t on t.id = e.title_id
      where e.organization_id = ${actor.organizationId}::uuid
      order by e.starts_at asc
      limit 500
    `;
    const toIso = (value: string | Date) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
    return {
      canManage,
      events: rows.map((row) => ({
        id: row.id,
        titleId: row.title_id,
        titleName: row.title_name,
        eventType: row.event_type as StudioScheduleEventType,
        eventName: row.event_name,
        startsAt: toIso(row.starts_at),
        endsAt: toIso(row.ends_at),
        location: row.location,
        notes: row.notes,
        status: row.status as StudioScheduleStatus,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
    };
  });

export const createStudioScheduleEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(async ({ context, data }) => {
    const { actor, sql, role, canManage } = await requireStudioScheduleMembership(context.userId);
    if (!canManage) throw new Error("Only Studio owners, admins or producers can create schedule events");
    if (!isValidStudioScheduleWindow(data.startsAt, data.endsAt)) {
      throw new Error("The event end must be later than its start");
    }
    const title = await requireStudioScheduleTitle(sql, data.titleId, actor.organizationId!);
    const rows = await sql.transaction(async (tx) => {
      const inserted = await tx<{ id: string }>`
        insert into bridge_production_schedule_events (
          organization_id, title_id, event_type, event_name, starts_at, ends_at,
          location, notes, status, created_by, updated_by
        ) values (
          ${actor.organizationId}::uuid, ${title.id}, ${data.eventType}, ${data.eventName},
          ${new Date(data.startsAt).toISOString()}, ${new Date(data.endsAt).toISOString()},
          ${data.location || null}, ${data.notes || null}, 'SCHEDULED', ${actor.userId}, ${actor.userId}
        )
        returning id
      `;
      await tx`
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (
          ${actor.userId}, 'studio.schedule_event_created',
          'bridge_production_schedule_event', ${inserted[0].id},
          ${JSON.stringify({
            organizationId: actor.organizationId,
            titleId: title.id,
            eventType: data.eventType,
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            status: "SCHEDULED",
            membershipRole: role,
          })}
        )
      `;
      return inserted;
    });
    return { eventId: rows[0].id };
  });

const statusInput = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
});

export const updateStudioScheduleEventStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(statusInput)
  .handler(async ({ context, data }) => {
    const { actor, sql, role, canManage } = await requireStudioScheduleMembership(context.userId);
    if (!canManage) throw new Error("Only Studio owners, admins or producers can update schedule events");
    await sql.transaction(async (tx) => {
      const rows = await tx<{ status: string; event_name: string; title_id: string }>`
        select status, event_name, title_id
        from bridge_production_schedule_events
        where id = ${data.eventId}::uuid
          and organization_id = ${actor.organizationId}::uuid
        for update
      `;
      const existing = rows[0];
      if (!existing) throw new Error("Schedule event was not found in this Studio organization");
      if (!canTransitionStudioScheduleStatus(existing.status as StudioScheduleStatus, data.status)) {
        throw new Error("This schedule event status transition is not allowed");
      }
      await tx`
        update bridge_production_schedule_events
        set status = ${data.status}, updated_by = ${actor.userId}, updated_at = now()
        where id = ${data.eventId}::uuid
          and organization_id = ${actor.organizationId}::uuid
      `;
      await tx`
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (
          ${actor.userId}, 'studio.schedule_event_status_updated',
          'bridge_production_schedule_event', ${data.eventId},
          ${JSON.stringify({
            organizationId: actor.organizationId,
            titleId: existing.title_id,
            eventName: existing.event_name,
            previousStatus: existing.status,
            status: data.status,
            membershipRole: role,
          })}
        )
      `;
    });
    return { eventId: data.eventId, status: data.status };
  });
