import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { canOperateOnTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";

const kinds = ["transcode", "compliance", "vault"] as const;
const open = ["submitted", "accepted", "working"] as const;

const nextStatus: Record<(typeof open)[number], string[]> = {
  submitted: ["accepted", "declined"],
  accepted: ["working", "declined"],
  working: ["done", "declined"],
};

type RequestRow = {
  id: string;
  kind: (typeof kinds)[number];
  note: string;
  status: string;
  admin_note: string;
  created_at: string | Date;
  title_name: string;
  email?: string | null;
  display_name?: string | null;
};

function isDesk(role: string | null) {
  return role === "admin" || role === "super_admin";
}

export const submitServiceRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    kind: z.enum(kinds),
    note: z.string().max(500).default(""),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canOperateOnTitle(actor, title, "title.update_own")) throw new Error("Not found");
    const note = data.note.trim();
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      insert into bridge_service_requests (owner_user_id, title_id, kind, note)
      values (${actor.userId}, ${title.id}, ${data.kind}, ${note})
      returning id
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "service.request_submitted",
      entityType: "bridge_service_request",
      entityId: rows[0].id,
      metadata: { titleId: title.id, kind: data.kind },
    });
    return { id: rows[0].id, status: "submitted" as const };
  });

export const listMyServiceRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const requests = await sql<RequestRow>`
      select r.id, r.kind, r.note, r.status, r.admin_note, r.created_at, t.name as title_name
      from bridge_service_requests r
      join bridge_titles t on t.id = r.title_id
      where r.owner_user_id = ${actor.userId}
      order by r.created_at desc
      limit 40
    `;
    return { requests };
  });

export const listDeskServiceRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isDesk(actor.internalRole)) throw new Error("Forbidden");
    const sql = await getSql();
    const requests = await sql<RequestRow>`
      select r.id, r.kind, r.note, r.status, r.admin_note, r.created_at, t.name as title_name, p.email, p.display_name
      from bridge_service_requests r
      join bridge_titles t on t.id = r.title_id
      left join bridge_profiles p on p.user_id = r.owner_user_id
      order by r.created_at desc
      limit 80
    `;
    return { requests };
  });

export const decideServiceRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    id: z.string().uuid(),
    status: z.enum(["accepted", "working", "done", "declined"]),
    adminNote: z.string().max(500).default(""),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isDesk(actor.internalRole)) throw new Error("Forbidden");
    const note = data.adminNote.trim();
    const sql = await getSql();
    const current = await sql<{ status: string }>`
      select status from bridge_service_requests where id = ${data.id} limit 1
    `;
    const from = current[0]?.status;
    if (!from || !(open as readonly string[]).includes(from) || !nextStatus[from as (typeof open)[number]].includes(data.status)) {
      throw new Error("This request cannot move there.");
    }
    const rows = await sql<{ id: string }>`
      update bridge_service_requests
      set status = ${data.status}, admin_note = ${note}, decided_by = ${actor.userId}, updated_at = now()
      where id = ${data.id} and status = ${from}
      returning id
    `;
    if (!rows[0]) throw new Error("This request changed. Refresh and try again.");
    await writeAudit({
      actorUserId: actor.userId,
      action: "service.request_decided",
      entityType: "bridge_service_request",
      entityId: data.id,
      metadata: { from, to: data.status },
    });
    return { id: data.id, status: data.status };
  });
