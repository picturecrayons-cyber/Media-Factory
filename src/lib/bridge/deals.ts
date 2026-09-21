import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireActor } from "./session";
import { canReadTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { DEAL_STATUSES } from "./studio-metrics";

export const listStudioDeals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const sql = await getSql();
    try {
      const rows = actor.organizationId
        ? await sql<{
            id: string;
            title_id: string;
            title_name: string;
            licensee: string;
            right_type: string;
            territory: string;
            platform: string;
            status: string;
            license_fee_paise: number;
            updated_at: string | Date;
          }>`
            select d.id, d.title_id, t.name as title_name, d.licensee, d.right_type, d.territory,
                   d.platform, d.status, d.license_fee_paise, d.updated_at
            from bridge_deals d
            join bridge_titles t on t.id = d.title_id
            where t.owner_user_id = ${actor.userId} or t.organization_id = ${actor.organizationId}
            order by d.updated_at desc limit 100
          `
        : await sql<{
            id: string;
            title_id: string;
            title_name: string;
            licensee: string;
            right_type: string;
            territory: string;
            platform: string;
            status: string;
            license_fee_paise: number;
            updated_at: string | Date;
          }>`
            select d.id, d.title_id, t.name as title_name, d.licensee, d.right_type, d.territory,
                   d.platform, d.status, d.license_fee_paise, d.updated_at
            from bridge_deals d
            join bridge_titles t on t.id = d.title_id
            where t.owner_user_id = ${actor.userId}
            order by d.updated_at desc limit 100
          `;
      return {
        deals: rows.map((r) => ({
          id: r.id,
          titleId: r.title_id,
          titleName: r.title_name,
          licensee: r.licensee,
          rightType: r.right_type,
          territory: r.territory,
          platform: r.platform,
          status: r.status,
          licenseFeePaise: Number(r.license_fee_paise ?? 0),
          updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
        })),
      };
    } catch {
      return { deals: [] as const, schemaPending: true };
    }
  });

export const createStudioDeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      licensee: z.string().min(2).max(160),
      rightType: z.string().min(2).max(80),
      territory: z.string().min(2).max(80),
      platform: z.string().min(2).max(80),
      notes: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    if (actor.accountType !== "studio" && !actor.internalRole) throw new Error("Studio desk only");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const sql = await getSql();
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_deals (
        id, title_id, organization_id, licensee, right_type, territory, platform, status, notes, actor_user_id
      ) values (
        ${id}, ${title.id}, ${actor.organizationId ?? null}, ${data.licensee}, ${data.rightType},
        ${data.territory}, ${data.platform}, ${"opportunity"}, ${data.notes ?? ""}, ${actor.userId}
      )
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "deal.create",
      entityType: "bridge_deal",
      entityId: id,
      metadata: { titleId: title.id, status: "opportunity" },
    });
    return { dealId: id };
  });

export const advanceStudioDeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ dealId: z.string().min(8), to: z.enum(DEAL_STATUSES), reason: z.string().max(400).optional() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; title_id: string; status: string }>`
      select id, title_id, status from bridge_deals where id = ${data.dealId} limit 1
    `;
    const deal = rows[0];
    if (!deal) throw new Error("Not found");
    const title = await loadTitle(deal.title_id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const fromIdx = DEAL_STATUSES.indexOf(deal.status as (typeof DEAL_STATUSES)[number]);
    const toIdx = DEAL_STATUSES.indexOf(data.to);
    if (fromIdx < 0 || toIdx !== fromIdx + 1) throw new Error("Illegal deal transition");
    if (data.to === "payment" || data.to === "rights_activated") {
      throw new Error("Payment and rights activation require captured payment evidence — not a dashboard toggle");
    }
    await sql`
      update bridge_deals set status = ${data.to}, updated_at = now() where id = ${deal.id}
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "deal.advance",
      entityType: "bridge_deal",
      entityId: deal.id,
      previousState: deal.status,
      newState: data.to,
      reason: data.reason ?? null,
    });
    return { ok: true };
  });
