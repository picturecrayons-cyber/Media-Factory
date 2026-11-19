import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

const statuses=["OPEN","IN_PROGRESS","WAITING_INTERNAL","WAITING_CUSTOMER","RESOLVED","CLOSED"] as const;
const priorities=["LOW","NORMAL","HIGH","URGENT"] as const;
async function guard(userId:string){
 assertNotDevUser(userId);
 const actor=await requireVerifiedActor(userId);
 if(actor.internalRole!=="super_admin") throw new Error("Super Admin access required");
 return actor;
}
function assertWritesEnabled(){
 if(process.env.BRIDGE_SUPPORT_WRITES_ENABLED!=="true") throw new Error("Support case writes are disabled until the Preview-only feature flag is explicitly enabled");
}
export const listSuperAdminSupportDesk=createServerFn({method:"GET"}).middleware([authMiddleware]).handler(async({context})=>{
 await guard(context.userId);
 const sql=await getSql();
 const [cases,inbound,events,staff]=await Promise.all([
  sql<{id:string;case_number:number|string;requester_email:string;subject:string;status:string;priority:string;assigned_to:string|null;created_at:string|Date;updated_at:string|Date}>`
   select id,case_number,requester_email,subject,status,priority,assigned_to,created_at,updated_at
   from private.bridge_support_cases
   order by case when status='OPEN' then 0 when status='IN_PROGRESS' then 1 when status like 'WAITING_%' then 2 else 3 end,
   case priority when 'URGENT' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end,updated_at desc limit 200
  `,
  sql<{id:string;sender:string;subject:string;preview:string|null;received_at:string|Date}>`
   select m.id,m.sender,m.subject,m.preview,m.received_at from private.bridge_inbound_mail_events m
   where not exists(select 1 from private.bridge_support_cases c where c.source_event_id=m.id)
   order by m.received_at desc limit 100
  `,
  sql<{id:string;case_id:string;actor_name:string;event_type:string;from_value:string|null;to_value:string|null;note:string|null;created_at:string|Date}>`
   select e.id,e.case_id,p.display_name as actor_name,e.event_type,e.from_value,e.to_value,e.note,e.created_at
   from private.bridge_support_case_events e join bridge_profiles p on p.user_id=e.actor_user_id
   order by e.created_at desc limit 500
  `,
  sql<{user_id:string;display_name:string;internal_role:string}>`
   select user_id,display_name,internal_role from bridge_profiles
   where internal_role is not null and email_verified=true order by display_name limit 200
  `,
 ]);
 return {
  cases:cases.map(r=>({id:r.id,caseNumber:Number(r.case_number),requesterEmail:r.requester_email,subject:r.subject,status:r.status,priority:r.priority,assignedTo:r.assigned_to,createdAt:r.created_at instanceof Date?r.created_at.toISOString():String(r.created_at),updatedAt:r.updated_at instanceof Date?r.updated_at.toISOString():String(r.updated_at)})),
  inbound:inbound.map(r=>({id:r.id,sender:r.sender,subject:r.subject,preview:r.preview,receivedAt:r.received_at instanceof Date?r.received_at.toISOString():String(r.received_at)})),
  staff:staff.map(r=>({userId:r.user_id,displayName:r.display_name,role:r.internal_role})),
  events:events.map(r=>({id:r.id,caseId:r.case_id,actorName:r.actor_name,eventType:r.event_type,fromValue:r.from_value,toValue:r.to_value,note:r.note,createdAt:r.created_at instanceof Date?r.created_at.toISOString():String(r.created_at)})),
  mutationsEnabled:process.env.BRIDGE_SUPPORT_WRITES_ENABLED==="true",
  outboundEmail:"DISABLED",
 };
});
export const createSupportCaseFromInbound=createServerFn({method:"POST"}).middleware([authMiddleware])
 .validator(z.object({inboundEventId:z.string().uuid(),priority:z.enum(priorities).default("NORMAL")}))
 .handler(async({context,data})=>{
  const actor=await guard(context.userId); assertWritesEnabled();
  const sql=await getSql();
  const result=await sql.transaction(async tx=>{
   const rows=await tx<{id:string;case_number:number|string}>`
    insert into private.bridge_support_cases(source_event_id,requester_email,subject,priority,created_by)
    select id,sender,subject,${data.priority},${actor.userId} from private.bridge_inbound_mail_events
    where id=${data.inboundEventId}::uuid on conflict(source_event_id) do nothing returning id,case_number
   `;
   if(!rows[0]){
    const existing=await tx<{id:string;case_number:number|string}>`select id,case_number from private.bridge_support_cases where source_event_id=${data.inboundEventId}::uuid limit 1`;
    if(!existing[0]) throw new Error("Inbound message not found");
    return {...existing[0],duplicate:true};
   }
   await tx`insert into private.bridge_support_case_events(case_id,actor_user_id,event_type,to_value) values(${rows[0].id}::uuid,${actor.userId},'CREATED','OPEN')`;
   await writeAudit({actorUserId:actor.userId,action:"support.case_created",entityType:"bridge_support_case",entityId:rows[0].id,metadata:{sourceEventId:data.inboundEventId,priority:data.priority}},tx);
   return {...rows[0],duplicate:false};
  });
  return {caseId:result.id,caseNumber:Number(result.case_number),duplicate:result.duplicate};
 });
export const updateSuperAdminSupportCase=createServerFn({method:"POST"}).middleware([authMiddleware])
 .validator(z.object({
  caseId:z.string().uuid(),status:z.enum(statuses).optional(),priority:z.enum(priorities).optional(),
  internalNote:z.string().trim().max(4000).optional(),assignedTo:z.string().min(1).nullable().optional(),
 }).refine(v=>Boolean(v.status||v.priority||v.internalNote||v.assignedTo!==undefined),"At least one case update is required"))
 .handler(async({context,data})=>{
  const actor=await guard(context.userId); assertWritesEnabled();
  const sql=await getSql();
  await sql.transaction(async tx=>{
   const rows=await tx<{status:string;priority:string;assigned_to:string|null}>`
    select status,priority,assigned_to from private.bridge_support_cases where id=${data.caseId}::uuid for update
   `;
   const current=rows[0]; if(!current) throw new Error("Support case not found");
   if(data.status&&data.status!==current.status){
    await tx`update private.bridge_support_cases set status=${data.status},resolved_at=case when ${data.status} in ('RESOLVED','CLOSED') then now() else null end,updated_at=now() where id=${data.caseId}::uuid`;
    await tx`insert into private.bridge_support_case_events(case_id,actor_user_id,event_type,from_value,to_value) values(${data.caseId}::uuid,${actor.userId},'STATUS_CHANGED',${current.status},${data.status})`;
   }
   if(data.priority&&data.priority!==current.priority){
    await tx`update private.bridge_support_cases set priority=${data.priority},updated_at=now() where id=${data.caseId}::uuid`;
    await tx`insert into private.bridge_support_case_events(case_id,actor_user_id,event_type,from_value,to_value) values(${data.caseId}::uuid,${actor.userId},'PRIORITY_CHANGED',${current.priority},${data.priority})`;
   }
   if(data.assignedTo!==undefined&&data.assignedTo!==current.assigned_to){
    if(data.assignedTo!==null){
     const assignees=await tx<{user_id:string}>`select user_id from bridge_profiles where user_id=${data.assignedTo} and internal_role is not null and email_verified=true limit 1`;
     if(!assignees[0]) throw new Error("Assignee must be a verified internal staff profile");
    }
    await tx`update private.bridge_support_cases set assigned_to=${data.assignedTo},updated_at=now() where id=${data.caseId}::uuid`;
    await tx`insert into private.bridge_support_case_events(case_id,actor_user_id,event_type,from_value,to_value) values(${data.caseId}::uuid,${actor.userId},'ASSIGNED',${current.assigned_to},${data.assignedTo})`;
   }
   if(data.internalNote) await tx`insert into private.bridge_support_case_events(case_id,actor_user_id,event_type,note) values(${data.caseId}::uuid,${actor.userId},'INTERNAL_NOTE',${data.internalNote})`;
   await writeAudit({actorUserId:actor.userId,action:"support.case_updated",entityType:"bridge_support_case",entityId:data.caseId,metadata:{status:data.status??null,priority:data.priority??null,assignedTo:data.assignedTo??null,internalNoteAdded:Boolean(data.internalNote)}},tx);
  });
  return {updated:true};
 });
