import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";

function load(role="super_admin") {
  const queries:string[]=[];
  const sql=async(strings:TemplateStringsArray)=>{
    const query=strings.join(" "); queries.push(query);
    if(query.includes("from private.bridge_support_cases")) return [{id:"case-1",case_number:4,requester_email:"masked@example.test",subject:"Question",status:"OPEN",priority:"NORMAL",assigned_to:null,created_at:new Date(),updated_at:new Date()}];
    if(query.includes("from private.bridge_inbound_mail_events")) return [{id:"event-1",sender:"sender@example.test",subject:"Help",preview:"Short preview",received_at:new Date()}];
    return [];
  };
  const modules:Record<string,unknown>={
    "@tanstack/react-start":{createServerFn:()=>{const b={middleware:()=>b,validator:()=>b,handler:(h:unknown)=>h};return b;}},
    "zod":{z:{enum:()=>({default:()=>({}),optional:()=>({})}),object:()=>({refine:()=>({})}),string:()=>({uuid:()=>({}),regex:()=>({}),min:()=>({max:()=>({})}),trim:()=>({max:()=>({})})})}},
    "@/lib/auth/middleware":{authMiddleware:{}},
    "@/lib/db":{getSql:async()=>sql},
    "./guards":{assertNotDevUser:()=>{}},
    "./session":{requireVerifiedActor:async()=>({internalRole:role,userId:"operator"})},
    "./audit":{writeAudit:async()=>{}},
  };
  const source=readFileSync(new URL("./super-admin-support.ts",import.meta.url),"utf8");
  const output=transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
  const exports:Record<string,(args:unknown)=>Promise<unknown>>={};
  runInNewContext(output,{exports,process:{env:{}},require:(name:string)=>{assert.ok(name in modules,`Unexpected dependency: ${name}`);return modules[name];}});
  return {exports,queries};
}
test("Super Admin support desk reads case and inbound metadata only",async()=>{
 const h=load();
 const result=await h.exports.listSuperAdminSupportDesk({context:{userId:"operator"}}) as {cases:Array<{id:string;status:string}>;inbound:Array<{id:string;preview:string}>;outboundEmail:string;mutationsEnabled:boolean;staff:unknown[];events:unknown[]};
 assert.equal(result.cases[0].status,"OPEN");
 assert.equal(result.inbound[0].preview,"Short preview");
 assert.equal(result.outboundEmail,"DISABLED");
 assert.equal(result.mutationsEnabled,false);
 assert.equal(h.queries.length,4);
 assert.ok(h.queries.every(q=>!/\b(insert|update|delete)\b/i.test(q)));
});
test("non-Super Admin staff cannot access support case data",async()=>{
 const h=load("admin");
 await assert.rejects(h.exports.listSuperAdminSupportDesk({context:{userId:"operator"}}),/Super Admin access required/);
 assert.equal(h.queries.length,0);
});

test("support case writes remain disabled without the explicit Preview feature flag",async()=>{
 const h=load();
 await assert.rejects(
  h.exports.createSupportCaseFromInbound({context:{userId:"operator"},data:{inboundEventId:"00000000-0000-4000-8000-000000000001",priority:"NORMAL"}}),
  /Support case writes are disabled/
 );
 assert.equal(h.queries.length,0);
});
