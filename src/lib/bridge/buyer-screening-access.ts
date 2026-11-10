import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { assertBuyerPublishable } from "./buyer-visibility";
import { writeAudit } from "./audit";

export type BuyerScreeningGrant = {
  titleId: string; buyerUserId: string; grantedBy: string;
  grantedAt: string; expiresAt: string | null; revokedAt: string | null;
};

export { isBuyerScreeningGrantActive } from "./buyer-screening-policy";

const grantInput = z.object({
  titleId: z.string().min(1).max(160),
  buyerUserId: z.string().min(1).max(160),
  expiresAt: z.string().datetime().nullable().optional(),
});
const revokeInput = z.object({
  titleId: z.string().min(1).max(160),
  buyerUserId: z.string().min(1).max(160),
  reason: z.string().trim().min(3).max(1000),
});
function assertBuyerGrantOperator(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (!actor.internalRole || !["admin", "super_admin"].includes(actor.internalRole)) {
    throw new Error("Admin or Super Admin access required");
  }
  assertPermission(actor, "title.license");
}

export const grantBuyerScreeningAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).validator(grantInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertBuyerGrantOperator(actor);
    if (data.expiresAt && Date.parse(data.expiresAt) <= Date.now()) throw new Error("Screening expiry must be in the future");
    const sql = await getSql();
    const buyers = await sql<{ user_id: string }>`
      select user_id from bridge_profiles
      where user_id = ${data.buyerUserId} and account_type = 'buyer' and email_verified = true limit 1
    `;
    if (!buyers[0]) throw new Error("Verified Buyer account not found");
    await assertBuyerPublishable(data.titleId);
    const titles = await sql<{ id: string; status: string }>`select id, status from bridge_titles where id = ${data.titleId} limit 1`;
    if (!titles[0]) throw new Error("Title not found");
    await sql.transaction(async (tx) => {
      await tx`
        insert into bridge_buyer_title_access (title_id,buyer_user_id,granted_by,granted_at,expires_at,revoked_at)
        values (${data.titleId},${data.buyerUserId},${actor.userId},now(),${data.expiresAt ?? null},null)
        on conflict (title_id,buyer_user_id) do update set
          granted_by=excluded.granted_by, granted_at=now(), expires_at=excluded.expires_at, revoked_at=null
      `;
      await writeAudit({actorUserId:actor.userId,action:"buyer.screening_access.grant",entityType:"bridge_buyer_title_access",entityId:data.titleId,metadata:{buyerUserId:data.buyerUserId,expiresAt:data.expiresAt??null,titleStatus:titles[0].status}},tx);
    });
    return {ok:true,titleId:data.titleId,buyerUserId:data.buyerUserId,expiresAt:data.expiresAt??null};
  });

export const revokeBuyerScreeningAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).validator(revokeInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertBuyerGrantOperator(actor);
    const sql = await getSql();
    await sql.transaction(async (tx) => {
      const rows = await tx<{title_id:string}>`
        update bridge_buyer_title_access set revoked_at=coalesce(revoked_at,now())
        where title_id=${data.titleId} and buyer_user_id=${data.buyerUserId} returning title_id
      `;
      if (!rows[0]) throw new Error("Buyer screening grant not found");
      await writeAudit({actorUserId:actor.userId,action:"buyer.screening_access.revoke",entityType:"bridge_buyer_title_access",entityId:data.titleId,metadata:{buyerUserId:data.buyerUserId,reason:data.reason}},tx);
    });
    return {ok:true,revoked:true};
  });

export const listBuyerScreeningAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware]).validator(z.object({titleId:z.string().min(1).max(160).optional()}))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    if (actor.accountType === "buyer" && !actor.internalRole) {
      const grants = await sql<BuyerScreeningGrant>`
        select title_id as "titleId",buyer_user_id as "buyerUserId",granted_by as "grantedBy",
          granted_at::text as "grantedAt",expires_at::text as "expiresAt",revoked_at::text as "revokedAt"
        from bridge_buyer_title_access where buyer_user_id=${actor.userId}
          and revoked_at is null and (expires_at is null or expires_at>now())
          and (${data.titleId??null}::text is null or title_id=${data.titleId??null})
        order by granted_at desc limit 200
      `;
      return {grants};
    }
    assertBuyerGrantOperator(actor);
    const grants = await sql<BuyerScreeningGrant>`
      select title_id as "titleId",buyer_user_id as "buyerUserId",granted_by as "grantedBy",
        granted_at::text as "grantedAt",expires_at::text as "expiresAt",revoked_at::text as "revokedAt"
      from bridge_buyer_title_access where (${data.titleId??null}::text is null or title_id=${data.titleId??null})
      order by granted_at desc limit 500
    `;
    return {grants};
  });

/** Must be called server-side before issuing a private screener URL or asset. */
export async function assertBuyerHasActiveScreeningGrant(titleId:string,buyerUserId:string):Promise<void>{
  const sql=await getSql();
  const rows=await sql<{allowed:boolean}>`
    select exists(select 1 from bridge_buyer_title_access a
      join bridge_profiles p on p.user_id=a.buyer_user_id
      where a.title_id=${titleId} and a.buyer_user_id=${buyerUserId}
        and p.account_type='buyer' and p.email_verified=true
        and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())) as allowed
  `;
  if(!rows[0]?.allowed) throw new Error("Private screening access denied");
  await assertBuyerPublishable(titleId);
}
