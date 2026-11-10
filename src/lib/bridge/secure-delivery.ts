import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

function assertDeliveryOperator(actor:Awaited<ReturnType<typeof requireVerifiedActor>>){
  if(!actor.internalRole||!["admin","super_admin"].includes(actor.internalRole)) throw new Error("Admin or Super Admin access required");
  assertPermission(actor,"title.deliver");
}
const grantInput=z.object({
  packageId:z.string().uuid(),titleId:z.string().min(1).max(160),buyerUserId:z.string().min(1).max(160),
  expiresAt:z.string().datetime(),reason:z.string().trim().min(3).max(1000),
});
const revokeInput=z.object({
  packageId:z.string().uuid(),titleId:z.string().min(1).max(160),buyerUserId:z.string().min(1).max(160),
  reason:z.string().trim().min(3).max(1000),
});
export const grantBuyerDeliveryAccess=createServerFn({method:"POST"}).middleware([authMiddleware]).validator(grantInput)
.handler(async({context,data})=>{
  const actor=await requireVerifiedActor(context.userId);assertDeliveryOperator(actor);
  if(Date.parse(data.expiresAt)<=Date.now()) throw new Error("Delivery access expiry must be in the future");
  const sql=await getSql();
  const buyer=await sql<{user_id:string}>`select user_id from bridge_profiles where user_id=${data.buyerUserId} and account_type='buyer' and email_verified=true limit 1`;
  if(!buyer[0]) throw new Error("Verified Buyer account not found");
  const packages=await sql<{id:string}>`
    select dp.id from bridge_destination_packages dp
    join bridge_rights_grants rg on rg.id=dp.rights_grant_id and rg.title_id=dp.title_id
    where dp.id=${data.packageId}::uuid and dp.title_id=${data.titleId}
      and dp.readiness_state in ('AUTHORIZED','DELIVERED') and dp.authorized_at is not null
      and rg.status='VALID' and rg.window_start<=now() and rg.window_end>now()
      and exists(select 1 from bridge_buyer_title_access a where a.title_id=dp.title_id
        and a.buyer_user_id=${data.buyerUserId} and a.revoked_at is null
        and (a.expires_at is null or a.expires_at>now()))
    limit 1
  `;
  if(!packages[0]) throw new Error("Authorized package, active rights window and buyer title mapping are required");
  await sql.transaction(async(tx)=>{
    await tx`
      insert into bridge_delivery_access_grants(package_id,title_id,buyer_user_id,granted_by,granted_at,expires_at,revoked_at)
      values(${data.packageId}::uuid,${data.titleId},${data.buyerUserId},${actor.userId},now(),${data.expiresAt},null)
      on conflict(package_id,buyer_user_id) do update set granted_by=excluded.granted_by,granted_at=now(),expires_at=excluded.expires_at,revoked_at=null
    `;
    await writeAudit({actorUserId:actor.userId,action:"delivery.access.grant",entityType:"bridge_delivery_access_grant",entityId:data.packageId,metadata:{titleId:data.titleId,buyerUserId:data.buyerUserId,expiresAt:data.expiresAt,reason:data.reason}},tx);
  });
  return {ok:true,packageId:data.packageId,buyerUserId:data.buyerUserId,expiresAt:data.expiresAt};
});
export const revokeBuyerDeliveryAccess=createServerFn({method:"POST"}).middleware([authMiddleware]).validator(revokeInput)
.handler(async({context,data})=>{
  const actor=await requireVerifiedActor(context.userId);assertDeliveryOperator(actor);
  const sql=await getSql();
  await sql.transaction(async(tx)=>{
    const rows=await tx<{package_id:string}>`
      update bridge_delivery_access_grants set revoked_at=coalesce(revoked_at,now())
      where package_id=${data.packageId}::uuid and title_id=${data.titleId} and buyer_user_id=${data.buyerUserId}
      returning package_id
    `;
    if(!rows[0]) throw new Error("Delivery access grant not found");
    await writeAudit({actorUserId:actor.userId,action:"delivery.access.revoke",entityType:"bridge_delivery_access_grant",entityId:data.packageId,metadata:{titleId:data.titleId,buyerUserId:data.buyerUserId,reason:data.reason}},tx);
  });
  return {ok:true,revoked:true};
});
export const listBuyerDeliveryAccess=createServerFn({method:"GET"}).middleware([authMiddleware])
.validator(z.object({packageId:z.string().uuid().optional()}))
.handler(async({context,data})=>{
  const actor=await requireVerifiedActor(context.userId);const sql=await getSql();
  if(actor.accountType==="buyer"&&!actor.internalRole){
    const grants=await sql`
      select g.package_id as "packageId",g.title_id as "titleId",t.name as "titleName",
        dp.destination, g.granted_at::text as "grantedAt",g.expires_at::text as "expiresAt"
      from bridge_delivery_access_grants g join bridge_titles t on t.id=g.title_id
      join bridge_destination_packages dp on dp.id=g.package_id and dp.title_id=g.title_id
      where g.buyer_user_id=${actor.userId} and g.revoked_at is null and g.expires_at>now()
        and (${data.packageId??null}::uuid is null or g.package_id=${data.packageId??null}::uuid)
      order by g.granted_at desc limit 200
    `;return {grants};
  }
  assertDeliveryOperator(actor);
  const grants=await sql`
    select g.package_id as "packageId",g.title_id as "titleId",t.name as "titleName",g.buyer_user_id as "buyerUserId",
      dp.destination,g.granted_at::text as "grantedAt",g.expires_at::text as "expiresAt",g.revoked_at::text as "revokedAt"
    from bridge_delivery_access_grants g join bridge_titles t on t.id=g.title_id
    join bridge_destination_packages dp on dp.id=g.package_id and dp.title_id=g.title_id
    where (${data.packageId??null}::uuid is null or g.package_id=${data.packageId??null}::uuid)
    order by g.granted_at desc limit 500
  `;return {grants};
});

export async function requestBuyerDeliveryAsset(packageId:string,titleId:string,buyerUserId:string,assetVersionId:string){
  const sql=await getSql();
  const rows=await sql<{s3_key:string;asset_id:string;checksum_sha256:string;byte_size:number}>`
    select av.s3_key,av.id::text as asset_id,av.checksum_sha256,av.byte_size
    from bridge_delivery_access_grants g
    join bridge_destination_packages dp on dp.id=g.package_id and dp.title_id=g.title_id
    join bridge_rights_grants rg on rg.id=dp.rights_grant_id and rg.title_id=dp.title_id
    join bridge_buyer_title_access ba on ba.title_id=g.title_id and ba.buyer_user_id=g.buyer_user_id
    join bridge_asset_versions av on av.title_id=dp.title_id
      and av.id=${assetVersionId}::uuid
      and dp.asset_version_ids @> jsonb_build_array(av.id::text)
    where g.package_id=${packageId}::uuid and g.title_id=${titleId} and g.buyer_user_id=${buyerUserId}
      and g.revoked_at is null and g.expires_at>now()
      and ba.revoked_at is null and (ba.expires_at is null or ba.expires_at>now())
      and dp.readiness_state in ('AUTHORIZED','DELIVERED')
      and rg.status='VALID' and rg.window_start<=now() and rg.window_end>now()
      and av.processing_state='PASSED' and av.checksum_sha256 is not null and av.byte_size>0
    limit 1
  `;
  if(!rows[0]) throw new Error("Delivery asset access denied");
  const {signDownload}=await import("./oci-object-storage.server");
  return {assetId:rows[0].asset_id,byteSize:Number(rows[0].byte_size),checksumSha256:rows[0].checksum_sha256,...await signDownload({key:rows[0].s3_key})};
}

export const signBuyerDeliveryAsset=createServerFn({method:"POST"}).middleware([authMiddleware])
.validator(z.object({packageId:z.string().uuid(),titleId:z.string().min(1),assetVersionId:z.string().uuid()}))
.handler(async({context,data})=>{
  const actor=await requireVerifiedActor(context.userId);
  if(actor.accountType!=="buyer"||actor.internalRole) throw new Error("Buyer account required");
  assertPermission(actor,"asset.sign_download");
  const signed=await requestBuyerDeliveryAsset(data.packageId,data.titleId,actor.userId,data.assetVersionId);
  const sql=await getSql();
  await writeAudit({actorUserId:actor.userId,action:"delivery.asset.signed",entityType:"bridge_delivery_asset_version",entityId:data.assetVersionId,metadata:{packageId:data.packageId,titleId:data.titleId}});
  return signed;
});

export const acceptBuyerDelivery=createServerFn({method:"POST"}).middleware([authMiddleware])
.validator(z.object({packageId:z.string().uuid(),titleId:z.string().min(1),manifestSha256:z.string().regex(/^[a-f0-9]{64}$/),note:z.string().max(1000).optional()}))
.handler(async({context,data})=>{
  const actor=await requireVerifiedActor(context.userId);
  if(actor.accountType!=="buyer"||actor.internalRole) throw new Error("Buyer account required");
  const sql=await getSql();
  const packageRows=await sql<{asset_version_ids:string[]|null}>`
    select dp.asset_version_ids from bridge_delivery_access_grants g
    join bridge_destination_packages dp on dp.id=g.package_id and dp.title_id=g.title_id
    join bridge_rights_grants rg on rg.id=dp.rights_grant_id and rg.title_id=dp.title_id
    join bridge_buyer_title_access ba on ba.title_id=g.title_id and ba.buyer_user_id=g.buyer_user_id
    where g.package_id=${data.packageId}::uuid and g.title_id=${data.titleId} and g.buyer_user_id=${actor.userId}
      and g.revoked_at is null and g.expires_at>now()
      and ba.revoked_at is null and (ba.expires_at is null or ba.expires_at>now())
      and dp.readiness_state in ('AUTHORIZED','DELIVERED')
      and rg.status='VALID' and rg.window_start<=now() and rg.window_end>now()
    limit 1
  `;
  if(!packageRows[0]) throw new Error("Delivery acceptance access denied");
  const ids=packageRows[0].asset_version_ids??[];
  if(!ids.length) throw new Error("Delivery package has no asset manifest");
  const assets=await sql<{id:string;checksum_sha256:string;byte_size:number;processing_state:string}>`
    select id::text,checksum_sha256,byte_size,processing_state from bridge_asset_versions
    where title_id=${data.titleId} and id::text=any(${ids}::text[])
    order by id
  `;
  if(assets.length!==ids.length||assets.some(a=>a.processing_state!=="PASSED"||!a.checksum_sha256||Number(a.byte_size)<=0)) throw new Error("Delivery manifest is incomplete or unverified");
  const canonical=assets.map(a=>`${a.id}:${a.checksum_sha256}:${a.byte_size}`).join("\n");
  const computed=createHash("sha256").update(canonical).digest("hex");
  if(computed!==data.manifestSha256) throw new Error("Delivery manifest checksum does not match");
  await sql.transaction(async(tx)=>{
    await tx`
      insert into bridge_delivery_receipts(package_id,title_id,buyer_user_id,manifest_sha256,accepted_asset_count,acceptance_note)
      values(${data.packageId}::uuid,${data.titleId},${actor.userId},${computed},${assets.length},${data.note??null})
      on conflict(package_id,buyer_user_id) do nothing
    `;
    await writeAudit({actorUserId:actor.userId,action:"delivery.accepted",entityType:"bridge_delivery_receipt",entityId:data.packageId,metadata:{titleId:data.titleId,manifestSha256:computed,assetCount:assets.length}},tx);
  });
  return {ok:true,manifestSha256:computed,acceptedAssetCount:assets.length};
});
