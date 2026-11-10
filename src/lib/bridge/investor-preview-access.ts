import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { assertBuyerPublishable } from "./buyer-visibility";
import { writeAudit } from "./audit";

export type InvestorPreviewGrant = {
  titleId:string; investorUserId:string; grantedBy:string; grantedAt:string;
  expiresAt:string|null; revokedAt:string|null; reason:string;
};
export function isInvestorPreviewGrantActive(
  grant:Pick<InvestorPreviewGrant,"expiresAt"|"revokedAt">, now=Date.now(),
):boolean{
  if(grant.revokedAt) return false;
  if(!grant.expiresAt) return true;
  const expiry=Date.parse(grant.expiresAt);
  return Number.isFinite(expiry)&&expiry>now;
}
function assertPreviewOperator(actor:Awaited<ReturnType<typeof requireVerifiedActor>>){
  if(!actor.internalRole||!["admin","super_admin"].includes(actor.internalRole)) throw new Error("Admin or Super Admin access required");
  assertPermission(actor,"title.license");
}
const grantInput=z.object({
  titleId:z.string().min(1).max(160), investorUserId:z.string().min(1).max(160),
  expiresAt:z.string().datetime().nullable().optional(), reason:z.string().trim().min(3).max(1000),
});
const revokeInput=z.object({
  titleId:z.string().min(1).max(160), investorUserId:z.string().min(1).max(160),
  reason:z.string().trim().min(3).max(1000),
});
export const grantInvestorPreviewAccess=createServerFn({method:"POST"}).middleware([authMiddleware]).validator(grantInput)
.handler(async({context,data})=>{
  const actor=await requireVerifiedActor(context.userId); assertPreviewOperator(actor);
  if(data.expiresAt&&(!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now())) throw new Error("Preview expiry must be in the future");
  const sql=await getSql();
  const investor=await sql<{user_id:string}>`select user_id from bridge_profiles where user_id=${data.investorUserId} and account_type='investor' and email_verified=true limit 1`;
  if(!investor[0]) throw new Error("Verified Investor account not found");
  await assertBuyerPublishable(data.titleId);
  await sql.transaction(async(tx)=>{
    await tx`
      insert into bridge_investor_preview_access(title_id,investor_user_id,granted_by,granted_at,expires_at,revoked_at,reason)
      values(${data.titleId},${data.investorUserId},${actor.userId},now(),${data.expiresAt??null},null,${data.reason})
      on conflict(title_id,investor_user_id) do update set
        granted_by=excluded.granted_by,granted_at=now(),expires_at=excluded.expires_at,revoked_at=null,reason=excluded.reason
    `;
    await writeAudit({actorUserId:actor.userId,action:"investor.preview_access.grant",entityType:"bridge_investor_preview_access",entityId:data.titleId,metadata:{investorUserId:data.investorUserId,expiresAt:data.expiresAt??null,reason:data.reason}},tx);
  });
  return {ok:true,titleId:data.titleId,investorUserId:data.investorUserId,expiresAt:data.expiresAt??null};
});
export const revokeInvestorPreviewAccess=createServerFn({method:"POST"}).middleware([authMiddleware]).validator(revokeInput)
.handler(async({context,data})=>{
  const actor=await requireVerifiedActor(context.userId); assertPreviewOperator(actor);
  const sql=await getSql();
  await sql.transaction(async(tx)=>{
    const rows=await tx<{title_id:string}>`
      update bridge_investor_preview_access set revoked_at=coalesce(revoked_at,now())
      where title_id=${data.titleId} and investor_user_id=${data.investorUserId} returning title_id
    `;
    if(!rows[0]) throw new Error("Investor preview grant not found");
    await writeAudit({actorUserId:actor.userId,action:"investor.preview_access.revoke",entityType:"bridge_investor_preview_access",entityId:data.titleId,metadata:{investorUserId:data.investorUserId,reason:data.reason}},tx);
  });
  return {ok:true,revoked:true};
});
export const listInvestorPreviewAccess=createServerFn({method:"GET"}).middleware([authMiddleware])
.validator(z.object({titleId:z.string().min(1).max(160).optional()}))
.handler(async({context,data})=>{
  const actor=await requireVerifiedActor(context.userId); const sql=await getSql();
  if(actor.accountType==="investor"&&!actor.internalRole){
    const grants=await sql<InvestorPreviewGrant>`
      select title_id as "titleId",investor_user_id as "investorUserId",granted_by as "grantedBy",
        granted_at::text as "grantedAt",expires_at::text as "expiresAt",revoked_at::text as "revokedAt",reason
      from bridge_investor_preview_access where investor_user_id=${actor.userId}
        and revoked_at is null and (expires_at is null or expires_at>now())
        and (${data.titleId??null}::text is null or title_id=${data.titleId??null})
      order by granted_at desc limit 200
    `; return {grants};
  }
  assertPreviewOperator(actor);
  const grants=await sql<InvestorPreviewGrant>`
    select title_id as "titleId",investor_user_id as "investorUserId",granted_by as "grantedBy",
      granted_at::text as "grantedAt",expires_at::text as "expiresAt",revoked_at::text as "revokedAt",reason
    from bridge_investor_preview_access where (${data.titleId??null}::text is null or title_id=${data.titleId??null})
    order by granted_at desc limit 500
  `; return {grants};
});
export async function hasActiveInvestorPreviewGrant(titleId:string,investorUserId:string):Promise<boolean>{
  const sql=await getSql();
  const rows=await sql<{allowed:boolean}>`
    select exists(select 1 from bridge_investor_preview_access a
      join bridge_profiles p on p.user_id=a.investor_user_id
      where a.title_id=${titleId} and a.investor_user_id=${investorUserId}
        and p.account_type='investor' and p.email_verified=true
        and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())) as allowed
  `;
  if(!rows[0]?.allowed) return false;
  try{await assertBuyerPublishable(titleId);return true;}catch{return false;}
}
