import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

const setInput = z.object({
  titleId: z.string().min(8).max(100),
  state: z.enum(["HOLD", "BLOCK"]),
  reason: z.string().trim().min(8).max(2000),
});
const releaseInput = z.object({
  titleId: z.string().min(8).max(100),
  reason: z.string().trim().min(8).max(2000),
});

export const getTitleControl = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8).max(100) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Verified Super Admin authority required");
    assertPermission(actor, "title.approve");
    const sql = await getSql();
    const [control] = await sql<{
      control_state: "CLEAR" | "HOLD" | "BLOCK";
      reason: string | null;
      set_by: string | null;
      set_at: string | Date | null;
      released_by: string | null;
      released_at: string | Date | null;
      release_reason: string | null;
      updated_at: string | Date;
    }>`select control_state,reason,set_by,set_at,released_by,released_at,release_reason,updated_at
      from public.bridge_title_controls where title_id=${data.titleId}`;
    const events = await sql<{
      id: number; control_state: string; action: string; reason: string;
      actor_user_id: string; created_at: string | Date;
    }>`select id,control_state,action,reason,actor_user_id,created_at
      from public.bridge_title_control_events where title_id=${data.titleId}
      order by created_at desc limit 100`;
    return {
      control: control ? {
        state: control.control_state, reason: control.reason, setBy: control.set_by,
        setAt: control.set_at ? new Date(control.set_at).toISOString() : null,
        releasedBy: control.released_by,
        releasedAt: control.released_at ? new Date(control.released_at).toISOString() : null,
        releaseReason: control.release_reason,
        updatedAt: new Date(control.updated_at).toISOString(),
      } : { state: "CLEAR" as const, reason: null, setBy: null, setAt: null, releasedBy: null, releasedAt: null, releaseReason: null, updatedAt: null },
      events: events.map((event) => ({
        id: Number(event.id), state: event.control_state, action: event.action,
        reason: event.reason, actorUserId: event.actor_user_id,
        createdAt: new Date(event.created_at).toISOString(),
      })),
    };
  });

export const setTitleControl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(setInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Verified Super Admin authority required");
    assertPermission(actor, "title.approve");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [title] = await tx<{ id: string }>`select id from public.bridge_titles where id=${data.titleId} for update`;
      if (!title) throw new Error("Title not found");
      const action = data.state === "HOLD" ? "SET_HOLD" : "SET_BLOCK";
      await tx`insert into public.bridge_title_controls(title_id,control_state,reason,set_by,set_at,released_by,released_at,release_reason,updated_at)
        values (${data.titleId},${data.state},${data.reason},${actor.userId},now(),null,null,null,now())
        on conflict(title_id) do update set control_state=excluded.control_state,reason=excluded.reason,
          set_by=excluded.set_by,set_at=now(),released_by=null,released_at=null,release_reason=null,updated_at=now()`;
      await tx`insert into public.bridge_title_control_events(title_id,control_state,action,reason,actor_user_id)
        values(${data.titleId},${data.state},${action},${data.reason},${actor.userId})`;
      await writeAudit({actorUserId:actor.userId,action:`title.control.${data.state.toLowerCase()}`,entityType:"bridge_title",entityId:data.titleId,metadata:{reason:data.reason}},tx);
      return {titleId:data.titleId,state:data.state};
    });
  });

export const releaseTitleControl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(releaseInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Verified Super Admin authority required");
    assertPermission(actor, "title.approve");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [control] = await tx<{control_state:string}>`select control_state from public.bridge_title_controls where title_id=${data.titleId} for update`;
      if (!control || control.control_state === "CLEAR") throw new Error("Title has no active HOLD or BLOCK");
      const action = control.control_state === "HOLD" ? "RELEASE_HOLD" : "UNBLOCK";
      await tx`update public.bridge_title_controls set control_state='CLEAR',reason=null,set_by=null,set_at=null,
        released_by=${actor.userId},released_at=now(),release_reason=${data.reason},updated_at=now()
        where title_id=${data.titleId}`;
      await tx`insert into public.bridge_title_control_events(title_id,control_state,action,reason,actor_user_id)
        values(${data.titleId},'CLEAR',${action},${data.reason},${actor.userId})`;
      await writeAudit({actorUserId:actor.userId,action:`title.control.${action.toLowerCase()}`,entityType:"bridge_title",entityId:data.titleId,metadata:{reason:data.reason,previousState:control.control_state}},tx);
      return {titleId:data.titleId,state:"CLEAR" as const,action};
    });
  });
