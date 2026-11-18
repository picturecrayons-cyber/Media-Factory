import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

const itemWindow=z.object({publishAt:z.string().datetime().nullable(),unpublishAt:z.string().datetime().nullable()})
  .refine(v=>!v.publishAt||!v.unpublishAt||new Date(v.unpublishAt)>new Date(v.publishAt),"Unpublish must be after publish");
const payloadSchema=z.object({
  hero:z.object({title:z.string().trim().min(1).max(120),subtitle:z.string().trim().max(280),featuredTitleId:z.string().uuid().nullable()}),
  banners:z.array(z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(120),subtitle:z.string().max(280),artworkUrl:z.string().url().refine(v=>v.startsWith("https://"),"Artwork URL must use HTTPS"),destinationTitleId:z.string().uuid(),sortOrder:z.number().int().min(0).max(1000),enabled:z.boolean(),...itemWindow.shape})).max(20),
  collections:z.array(z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(100),description:z.string().max(280),titleIds:z.array(z.string().uuid()).max(100),sortOrder:z.number().int().min(0).max(1000),enabled:z.boolean(),...itemWindow.shape})).max(30),
});
const scheduleSchema=z.object({publishAt:z.string().datetime(),unpublishAt:z.string().datetime().nullable()})
  .refine(v=>!v.unpublishAt||new Date(v.unpublishAt)>new Date(v.publishAt),"Unpublish must be after publish");
async function guard(userId:string){
 assertNotDevUser(userId);
 const actor=await requireVerifiedActor(userId);
 if(actor.internalRole!=="super_admin") throw new Error("Super Admin access required");
 if(process.env.BRIDGE_LOOP_MERCHANDISING_WRITES!=="true") throw new Error("Loop merchandising writes are disabled until the Preview-only feature flag is explicitly enabled");
 return actor;
}
async function assertEligibleTitleReferences(sql:Awaited<ReturnType<typeof getSql>>,payload:z.infer<typeof payloadSchema>,publishAt:string,unpublishAt:string|null){
 const ids=[payload.hero.featuredTitleId,...payload.banners.filter(x=>x.enabled).map(x=>x.destinationTitleId),...payload.collections.filter(x=>x.enabled).flatMap(x=>x.titleIds)].filter((x):x is string=>Boolean(x));
 const unique=[...new Set(ids)];
 if(!unique.length) return;
 const rows=await sql<{loop_title_id:string}>`
  select distinct p.loop_title_id
  from bridge_loop_publications p
  join loop_titles lt on lt.id=p.loop_title_id
  where p.loop_title_id = any(§{unique}::uuid[])
    and p.authorization_status='authorized'
    and p.revoked_at is null and p.approved_at is not null
    and p.window_start <= §{publishAt}::timestamptz
    and (p.window_end is null or p.window_end > coalesce(§{unpublishAt}::timestamptz,now()))
    and lt.status='approved' and lt.listed=true and lt.published=true
 `;
 const valid=new Set(rows.map(r=>r.loop_title_id));
 const missing=unique.filter(id=>!valid.has(id));
 if(missing.length) throw new Error("Every enabled hero, banner and collection title must have an active Bridge authorization covering the merchandising window");
}
export const getSuperAdminLoopMerchandising= createServerFn({method:"GET"}).middleware([authMiddleware]).handler(async({context})=>{
 assertNotDevUser(context.userId);
 const actor=await requireVerifiedActor(context.userId);
 if(actor.internalRole!=="super_admin") throw new Error("Super Admin access required");
 const sql=await getSql();
 const rows=await sql<{payload:unknown;status:string;publish_at:string|Date|null;unpublish_at:string|Date|null;version:number;updated_at:string|Date}>`
  select payload,status,publish_at,unpublish_at,version,updated_at
  from loop_merchandising_documents where document_key='homepage' limit 1
 `;
 const row=rows[0];
 return {document:row?{payload:payloadSchema.parse(row.payload),status:row.status,publishAt:row.publish_at==null?null:row.publish_at instanceof Date?row.publish_at.toISOString():String(row.publish_at),unpublishAt:row.unpublish_at==null?null:row.unpublish_at instanceof Date?row.unpublish_at.toISOString():String(row.unpublish_at),version:row.version,updatedAt:row.updated_at instanceof Date?row.updated_at.toISOString():String(row.updated_at)}:null,mutationsEnabled:process.env.BRIDGE_LOOP_MERCHANDISING_WRITES==="true"};
});
export const saveSuperAdminLoopMerchandisingDraft=createServerFn({method:"POST"}).middleware([authMiddleware])
 .validator(z.object({expectedVersion:z.number().int().min(0),payload:payloadSchema}))
 .handler(async({context,data})=>{
  const actor=await guard(context.userId);
  const sql=await getSql();
  await assertEligibleTitleReferences(sql,data.payload,new Date().toISOString(),null);
  const rows=await sql<{version:number}>`
   insert into loop_merchandising_documents(document_key,payload,status,version,updated_by,updated_at)
   values('homepage',§{JSON.stringify(data.payload)}::jsonb,'DRAFT',1,§{actor.userId},now())
   on conflict(document_key) do update set payload=excluded.payload,status='DRAFT',publish_at=null,unpublish_at=null,published_at=null,version=loop_merchandising_documents.version+1,updated_by=excluded.updated_by,updated_at=now()
   where loop_merchandising_documents.version=§{data.expectedVersion}
   returning version
  `;
  if(!rows[0]) throw new Error("Merchandising draft changed elsewhere; reload before saving");
  await writeAudit({actorUserId:actor.userId,action:"loop.merchandising_draft_saved",entityType:"loop_merchandising_document",entityId:"homepage",metadata:{version:rows[0].version,bannerCount:data.payload.banners.length,collectionCount:data.payload.collections.length}});
  return {saved:true,version:rows[0].version};
 });
export const scheduleSuperAdminLoopMerchandising=createServerFn({method:"POST"}).middleware([authMiddleware])
 .validator(z.object({expectedVersion:z.number().int().min(1),...scheduleSchema.shape}))
 .handler(async({context,data})=>{
  const actor=await guard(context.userId);
  if(new Date(data.publishAt).getTime()<Date.now()-60_000) throw new Error("Publish time cannot be in the past");
  const sql=await getSql();
  const docs=await sql<{payload:unknown}>`select payload from loop_merchandising_documents where document_key='homepage' and version=§{data.expectedVersion} for update`;
  if(!docs[0]) throw new Error("Merchandising draft changed elsewhere; reload before scheduling");
  const payload=payloadSchema.parse(docs[0].payload);
  await assertEligibleTitleReferences(sql,payload,data.publishAt,data.unpublishAt);
  const status=new Date(data.publishAt).getTime()>Date.now()?"SCHEDULED":"PUBLISHED";
  const rows=await sql<{version:number}>`
   update loop_merchandising_documents set status=§{status},publish_at=§{data.publishAt}::timestamptz,unpublish_at=§{data.unpublishAt}::timestamptz,published_at=case when §{status}='PUBLISHED' then now() else null end,version=version+1,updated_by=§{actor.userId},updated_at=now()
   where document_key='homepage' and version=§{data.expectedVersion} returning version
  `;
  if(!rows[0]) throw new Error("Merchandising document changed elsewhere; reload before scheduling");
  await writeAudit({actorUserId:actor.userId,action:"loop.merchandising_scheduled",entityType:"loop_merchandising_document",entityId:"homepage",metadata:{status,publishAt:data.publishAt,unpublishAt:data.unpublishAt,version:rows[0].version}});
  return {scheduled:true,status,version:rows[0].version};
 });
