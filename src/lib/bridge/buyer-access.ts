import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { Actor } from "./rbac";
import { assertPermission, canReadTitle } from "./rbac";
import { requireActor } from "./session";
import { assertNotDevUser } from "./guards";
import { isBuyerVisible } from "./lifecycle";

export async function buyerHasTitleAccess(userId: string, titleId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ allowed: boolean }>`
    select exists (
      select 1 from bridge_buyer_title_access
      where buyer_user_id = ${userId} and title_id = ${titleId}
        and revoked_at is null and (expires_at is null or expires_at > now())
    ) or exists (
      select 1 from bridge_entitlements
      where user_id = ${userId} and title_id = ${titleId} and access_type = 'license'
    ) as allowed
  `;
  return rows[0]?.allowed === true;
}

export async function assertTitleRead(actor: Actor, title: { id: string; ownerUserId: string; status: import("./types").TitleStatus }) {
  const shared = actor.accountType === "buyer" && !actor.internalRole
    ? await buyerHasTitleAccess(actor.userId, title.id)
    : false;
  if (!canReadTitle(actor, title, shared)) throw new Error("Not found");
}

export const listBuyerAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.license");
    const sql = await getSql();
    const buyers = await sql<{ user_id: string; display_name: string; email: string }>`
      select user_id, display_name, email from bridge_profiles
      where account_type = 'buyer' and email_verified = true order by display_name limit 200
    `;
    const shares = await sql<{ title_id: string; buyer_user_id: string; expires_at: string | null }>`
      select title_id, buyer_user_id, expires_at from bridge_buyer_title_access
      where revoked_at is null and (expires_at is null or expires_at > now())
      order by granted_at desc limit 200
    `;
    return { buyers: buyers.map(b => ({ userId: b.user_id, name: b.display_name, email: b.email })),
      shares: shares.map(s => ({ titleId: s.title_id, buyerUserId: s.buyer_user_id, expiresAt: s.expires_at })) };
  });

export const setBuyerTitleAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    buyerUserId: z.string().min(1),
    allow: z.boolean(),
    expiresAt: z.string().datetime().nullable().optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.license");
    const sql = await getSql();
    const titles = await sql<{ id: string; status: import("./types").TitleStatus }>`
      select id, status from bridge_titles where id = ${data.titleId} limit 1
    `;
    const title = titles[0];
    if (!title || !isBuyerVisible(title.status)) throw new Error("Title is not available to share");
    const buyer = await sql<{ user_id: string }>`
      select user_id from bridge_profiles
      where user_id = ${data.buyerUserId} and account_type = 'buyer' and email_verified = true
      limit 1
    `;
    if (!buyer[0]) throw new Error("Verified buyer not found");
    if (data.allow && data.expiresAt && new Date(data.expiresAt) <= new Date()) {
      throw new Error("Expiry must be in the future");
    }
    const metadata = JSON.stringify({ buyerUserId: data.buyerUserId, expiresAt: data.allow ? data.expiresAt ?? null : null });
    // The mutation and audit event are one SQL statement. The shared pool does
    // not offer connection-bound transactions through getSql().
    if (data.allow) {
      await sql`
        with changed as (
          insert into bridge_buyer_title_access (title_id, buyer_user_id, granted_by, expires_at, revoked_at)
          values (${title.id}, ${data.buyerUserId}, ${actor.userId}, ${data.expiresAt ?? null}, null)
          on conflict (title_id, buyer_user_id) do update
          set granted_by = excluded.granted_by, granted_at = now(), expires_at = excluded.expires_at, revoked_at = null
          returning title_id
        )
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        select ${actor.userId}, ${"buyer.title_shared"}, ${"bridge_title"}, title_id, ${metadata} from changed
      `;
    } else {
      await sql`
        with changed as (
          update bridge_buyer_title_access set revoked_at = now()
          where title_id = ${title.id} and buyer_user_id = ${data.buyerUserId} and revoked_at is null
          returning title_id
        )
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        select ${actor.userId}, ${"buyer.title_revoked"}, ${"bridge_title"}, title_id, ${metadata} from changed
      `;
    }
    return { allowed: data.allow };
  });
