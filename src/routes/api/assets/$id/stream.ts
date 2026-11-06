import { createFileRoute } from "@tanstack/react-router";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { getSql } from "@/lib/db";
import { verifyAssetStreamToken } from "@/lib/bridge/asset-stream-token.server";
import { getObjectResponse } from "@/lib/bridge/oci-object-storage.server";
import { loadTitle } from "@/lib/bridge/titles";
import { canReadTitle } from "@/lib/bridge/rbac";
import { downloadDecision } from "@/lib/bridge/delivery-policy";
import { assertBuyerPublishable } from "@/lib/bridge/buyer-visibility";

export const Route = createFileRoute("/api/assets/$id/stream")({
  server: { handlers: { GET: async ({ request, params }) => {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    let claims;
    try { claims = verifyAssetStreamToken(token, params.id); }
    catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
    let actor;
    try { actor = await requireVerifiedActor(claims.actorUserId); }
    catch { return Response.json({ error: "Forbidden" }, { status: 403 }); }

    const sql = await getSql();
    const rows = await sql<{
      id:string; title_id:string; kind:string; verified_object_key:string|null;
      checksum_sha256:string|null; content_type:string|null; byte_size:number|null;
    }>`
      select id,title_id,kind,verified_object_key,checksum_sha256,content_type,byte_size
      from bridge_assets where id=${params.id} limit 1
    `;
    const asset=rows[0];
    if(!asset || !asset.verified_object_key || !/^[a-f0-9]{64}$/.test(asset.checksum_sha256??"") || Number(asset.byte_size??0)<=0)
      return Response.json({error:"Asset unavailable"},{status:404});
    const title=await loadTitle(asset.title_id);
    if(!title || !canReadTitle(actor,title)) return Response.json({error:"Forbidden"},{status:403});
    const ent=await sql<{ok:boolean}>`
      select exists(select 1 from bridge_entitlements where user_id=${actor.userId}
        and title_id=${title.id} and access_type='license') as ok
    `;
    const decision=downloadDecision({
      kind:asset.kind, actorIsOwner:title.ownerUserId===actor.userId,
      actorIsInternal:Boolean(actor.internalRole), accountType:actor.accountType,
      hasLicenseEntitlement:Boolean(ent[0]?.ok),
    });
    if(!decision.allow) return Response.json({error:"Forbidden"},{status:403});
    if(actor.accountType==="buyer" && !actor.internalRole) {
      try { await assertBuyerPublishable(title.id); }
      catch { return Response.json({error:"Title is not currently authorized for buyers"},{status:403}); }
    }
    const range=request.headers.get("range")??undefined;
    let upstream:Response;
    try { upstream=await getObjectResponse(asset.verified_object_key,range); }
    catch { return Response.json({error:"Invalid byte range or upstream failure"},{status:416}); }
    if(upstream.status===416) return new Response(null,{status:416,headers:{"accept-ranges":"bytes","cache-control":"private, no-store"}});
    if(!upstream.ok || !upstream.body) return Response.json({error:"Asset stream unavailable"},{status:upstream.status===404?404:502});
    const headers=new Headers({
      "content-type":upstream.headers.get("content-type")||asset.content_type||"application/octet-stream",
      "content-length":upstream.headers.get("content-length")||String(asset.byte_size),
      "accept-ranges":"bytes","cache-control":"private, no-store",
      "x-content-type-options":"nosniff","content-disposition":"inline",
    });
    const contentRange=upstream.headers.get("content-range");
    if(contentRange) headers.set("content-range",contentRange);
    return new Response(upstream.body,{status:upstream.status,headers});
  }}}
});
