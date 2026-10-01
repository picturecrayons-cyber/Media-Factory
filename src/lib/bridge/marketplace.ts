import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

const MARKET_STATUSES = ["LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED","DELIVERED"] as const;

export const listMarketplaceTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();
    const rows = await sql<{
      id:string; name:string; language:string; year:number|null; synopsis:string;
      status:string; poster_key:string|null;
    }>`
      select id, name, language, year, synopsis, status, poster_key
      from bridge_titles
      where status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
      order by updated_at desc
      limit 200
    `;
    return { titles: rows.map((r)=>({
      id:r.id, name:r.name, language:r.language, year:r.year,
      synopsis:r.synopsis, status:r.status, posterKey:r.poster_key,
      availableRights: r.status === "LIVE_FOR_BUYERS" ? "Available" : "By request",
    })) };
  });

export const createLicenseRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId:z.string().min(8),
    territory:z.string().min(2).max(80),
    language:z.string().min(2).max(80),
    platform:z.string().min(2).max(80),
    window:z.string().min(2).max(120),
    exclusivity:z.enum(["NON_EXCLUSIVE","EXCLUSIVE"]).default("NON_EXCLUSIVE"),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    if (actor.accountType !== "buyer" && !actor.internalRole) throw new Error("Buyer access required");
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();
    const visible = await sql<{id:string}>`
      select id from bridge_titles
      where id=${data.titleId}
      and status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
      limit 1
    `;
    if (!visible[0]) throw new Error("Title is not available for buyer requests");
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_license_requests
        (id,title_id,buyer_user_id,territory,language,platform,window_label,exclusivity,status,created_at,updated_at)
      values
        (${id},${data.titleId},${actor.userId},${data.territory},${data.language},${data.platform},${data.window},${data.exclusivity},'REQUESTED',now(),now())
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "marketplace.license_request.create",
      entityType: "bridge_license_request",
      entityId: id,
      metadata: { titleId:data.titleId, territory:data.territory, language:data.language, platform:data.platform, window:data.window, exclusivity:data.exclusivity },
    });
    return { id, status:"REQUESTED" as const };
  });

export const listLicenseRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const sql = await getSql();
    const rows = actor.internalRole
      ? await sql<any>`select * from bridge_license_requests order by created_at desc limit 200`
      : await sql<any>`select * from bridge_license_requests where buyer_user_id=${actor.userId} order by created_at desc limit 100`;
    return { requests: rows };
  });
