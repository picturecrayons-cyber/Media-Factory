import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, canOperateOnTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { bridgeEnv } from "./env";
import { paymentVerifyBody, verifyRazorpaySignature } from "./razorpay-crypto";
import { destinationSchema, detectRequiredWork } from "./service-pricing";

const quoteInputSchema = z.object({
  titleId: z.string().min(8),
  destinations: z.array(destinationSchema).min(1).max(20),
  subtitleLanguages: z.array(z.string().min(2).max(80)).max(10).default([]),
  requestedDubbingLanguages: z.array(z.string().min(2).max(80)).max(10).default([]),
});

async function loadAssetEvidence(titleId: string) {
  const sql = await getSql();
  return sql.query<{ kind: string; ready: boolean; source: DetectedAsset["source"] }>(
    "select kind, true as ready, 'legacy_asset'::text as source from public.bridge_assets where title_id=$1 union all select case when asset_group='VIDEO' then 'master' when asset_group='AUDIO' then 'audio' when asset_group='SUBTITLE' then 'subtitle' when asset_group='ARTWORK' then 'poster' else lower(asset_group) end as kind, (processing_state='PASSED') as ready, 'asset_version'::text as source from public.bridge_asset_versions where title_id=$1", [titleId]);
}

async function getActiveRate(serviceCode: string) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; base_price_paise: number | null; minimum_price_paise: number | null; version: number }>(
    "select id,base_price_paise,minimum_price_paise,version from public.bridge_service_rates where service_code=$1 and active=true and currency='INR' and effective_from<=now() and (effective_to is null or effective_to>now()) order by effective_from desc,version desc limit 1", [serviceCode]);
  if (!rows[0] || rows[0].base_price_paise === null) throw new Error("RATE_CONFIGURATION_REQUIRED:" + serviceCode);
  return rows[0];
}

async function getCatalog(serviceCode: string) {
  const sql = await getSql();
  const rows = await sql.query<{ name: string; classification: string; pricing_method: string; unit_label: string }>("select name,classification,pricing_method,unit_label from public.bridge_service_catalog where code=$1 and active=true limit 1",[serviceCode]);
  if (!rows[0]) throw new Error("SERVICE_NOT_ACTIVE:" + serviceCode);
  return rows[0];
}

async function getTaxRate() {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; rate_percent: number }>("select id,rate_percent from public.bridge_tax_rates where active=true and currency='INR' and effective_from<=now() and (effective_to is null or effective_to>now()) order by effective_from desc limit 1",[]);
  if (!rows[0]) throw new Error("TAX_CONFIGURATION_REQUIRED");
  return rows[0];
}

export const createServiceQuote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(quoteInputSchema).handler(async ({ context, data }) => {
  assertNotDevUser(context.userId);
  const actor = await requireVerifiedActor(context.userId);
  assertPermission(actor, "service.quote_create");
  const title = await loadTitle(data.titleId);
  if (!title || !canOperateOnTitle(actor,title,"title.read_own","title.read_catalog")) throw new Error("Not found");
  const assets = await loadAssetEvidence(title.id);
  const plan = detectRequiredWork({ runtimeMinutes:title.runtimeMinutes, destinations:data.destinations, assets, subtitleLanguages:data.subtitleLanguages, requestedDubbingLanguages:data.requestedDubbingLanguages });
  const lines: Array<Record<string, unknown>> = [];
  for (const work of plan.requiredWork) {
    const [rate,catalog] = await Promise.all([getActiveRate(work.serviceCode),getCatalog(work.serviceCode)]);
    const quantity = ["PER_FINISHED_MINUTE","PER_DESTINATION","PER_LANGUAGE","PER_REVISION","PER_GB"].includes(catalog.pricing_method) ? work.quantity : 1;
    const lineTotal = Math.max(Math.round(rate.base_price_paise * quantity), rate.minimum_price_paise ?? 0);
    lines.push({ serviceCode:work.serviceCode,rateId:rate.id,rateVersion:rate.version,classification:catalog.classification,pricingMethod:catalog.pricing_method,unitLabel:catalog.unit_label,quantity,unitPricePaise:rate.base_price_paise,lineTotalPaise:lineTotal,evidence:work });
  }
  const subtotal = lines.filter((x) => x.classification==="BILLABLE" || x.classification==="PASS_THROUGH").reduce((s,x)=>s+Number(x.lineTotalPaise),0);
  const tax = await getTaxRate();
  const taxPaise = Math.round(subtotal * Number(tax.rate_percent) / 100);
  const total = subtotal + taxPaise;
  const sql = await getSql();
  const quoteNumber = "CRQ-" + new Date().toISOString().slice(0,10).replaceAll("-","") + "-" + randomBytes(4).toString("hex").toUpperCase();
  const quote = await sql.query<{ id:string }>("insert into public.bridge_service_quotes(quote_number,user_id,title_id,status,runtime_minutes,selected_destinations,detected_assets,required_work,pricing_snapshot,subtotal_paise,tax_paise,total_paise) values($1,$2,$3,'QUOTED',$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11) returning id",[quoteNumber,actor.userId,title.id,title.runtimeMinutes,JSON.stringify(data.destinations),JSON.stringify(plan.detectedAssets),JSON.stringify(plan.requiredWork),JSON.stringify({taxRateId:tax.id,taxRatePercent:tax.rate_percent,rates:lines.map((x)=>({serviceCode:x.serviceCode,rateId:x.rateId,version:x.rateVersion}))}),subtotal,taxPaise,total]);
  for (const line of lines) await sql.query("insert into public.bridge_service_quote_lines(quote_id,service_code,rate_id,classification,pricing_method,unit_label,quantity,unit_price_paise,line_total_paise,evidence) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",[quote[0].id,line.serviceCode,line.rateId,line.classification,line.pricingMethod,line.unitLabel,line.quantity,line.unitPricePaise,line.lineTotalPaise,JSON.stringify(line.evidence)]);
  await writeAudit({actorUserId:actor.userId,action:"service.quote_created",entityType:"bridge_service_quote",entityId:quote[0].id,metadata:{titleId:title.id,quoteNumber,subtotal,taxPaise,total}});
  return {quoteId:quote[0].id,quoteNumber,status:"QUOTED",currency:"INR",subtotalPaise:subtotal,taxPaise,totalPaise:total,detectedAssets:plan.detectedAssets,requiredWork:plan.requiredWork,lines};
});

export const acceptServiceQuote = createServerFn({ method:"POST" }).middleware([authMiddleware]).validator(z.object({quoteId:z.string().uuid()})).handler(async ({context,data})=>{
  assertNotDevUser(context.userId); const actor=await requireVerifiedActor(context.userId); assertPermission(actor,"service.order_create");
  const sql=await getSql(); const rows=await sql.query<{id:string;user_id:string;title_id:string;status:string;total_paise:number;currency:string}>("select id,user_id,title_id,status,total_paise,currency from public.bridge_service_quotes where id=$1 limit 1",[data.quoteId]);
  const quote=rows[0]; if(!quote || quote.user_id!==actor.userId || quote.status!=="QUOTED") throw new Error("Quote is unavailable");
  await sql.query("update public.bridge_service_quotes set status='ACCEPTED',accepted_at=now(),updated_at=now() where id=$1 and status='QUOTED'",[quote.id]);
  const order=await sql.query<{id:string}>("insert into public.bridge_service_orders(quote_id,user_id,title_id,status,amount_paise,currency) values($1,$2,$3,'PAYMENT_PENDING',$4,$5) on conflict(quote_id) do nothing returning id",[quote.id,actor.userId,quote.title_id,quote.total_paise,quote.currency]);
  if(!order[0]) throw new Error("Service order already exists");
  await sql.query("insert into public.bridge_service_order_events(order_id,to_status,actor_user_id,note) values($1,'PAYMENT_PENDING',$2,'service quote accepted')",[order[0].id,actor.userId]);
  return {orderId:order[0].id,amountPaise:quote.total_paise,currency:quote.currency};
});

async function razorpayFetch<T>(path:string,init:RequestInit={}){ const keyId=bridgeEnv.razorpayKeyId(); const keySecret=bridgeEnv.razorpayKeySecret(); if(!keyId||!keySecret) throw new Error("Razorpay is not configured"); const auth=Buffer.from(keyId+":"+keySecret).toString("base64"); const res=await fetch("https://api.razorpay.com/v1"+path,{...init,headers:{Authorization:"Basic "+auth,"Content-Type":"application/json",...(init.headers??{})}}); if(!res.ok) throw new Error("Razorpay request failed"); return await res.json() as T; }

export async function createServicePaymentOrder(opts:{orderId:string;actorUserId:string;idempotencyKey:string}){
  const sql=await getSql(); const rows=await sql.query<{id:string;user_id:string;status:string;amount_paise:number;currency:string;title_id:string}>("select id,user_id,status,amount_paise,currency,title_id from public.bridge_service_orders where id=$1 limit 1",[opts.orderId]);
  const order=rows[0]; if(!order||order.user_id!==opts.actorUserId||order.status!=="PAYMENT_PENDING") throw new Error("Service order unavailable");
  const existing=await sql.query<{id:string;provider_order_id:string|null;amount_paise:number}>("select id,provider_order_id,amount_paise from public.bridge_payments where user_id=$1 and purpose='service_order' and idempotency_key=$2 limit 1",[opts.actorUserId,opts.idempotencyKey]);
  const keyId=bridgeEnv.razorpayKeyId(); if(!keyId) throw new Error("Razorpay is not configured");
  if(existing[0]?.provider_order_id) return {orderId:existing[0].provider_order_id,amountPaise:existing[0].amount_paise,currency:order.currency,keyId,paymentRecordId:existing[0].id};
  const rz=await razorpayFetch<{id:string}>("/orders",{method:"POST",body:JSON.stringify({amount:order.amount_paise,currency:order.currency,receipt:opts.idempotencyKey.slice(0,40),notes:{serviceOrderId:order.id,titleId:order.title_id,userId:opts.actorUserId}})});
  const paymentId=randomBytes(16).toString("hex"); const inserted=await sql.query<{id:string}>("insert into public.bridge_payments(id,user_id,title_id,purpose,provider_order_id,amount_paise,currency,status,idempotency_key) values($1,$2,$3,'service_order',$4,$5,$6,'created',$7) on conflict(user_id,purpose,idempotency_key) do nothing returning id",[paymentId,opts.actorUserId,order.title_id,rz.id,order.amount_paise,order.currency,opts.idempotencyKey]);
  if(!inserted[0]) throw new Error("Service payment order already exists"); await sql.query("update public.bridge_service_orders set payment_id=$1,updated_at=now() where id=$2",[paymentId,order.id]);
  return {orderId:rz.id,amountPaise:order.amount_paise,currency:order.currency,keyId,paymentRecordId:paymentId};
}

export async function captureServicePayment(opts:{orderId:string;paymentId:string;actorUserId?:string|null}){
  const captured=await razorpayFetch<{id:string;order_id:string;status:string;amount:number;currency:string}>("/payments/"+opts.paymentId); if(captured.status!=="captured"||captured.order_id!==opts.orderId) throw new Error("Payment is not captured or does not match order");
  const sql=await getSql(); const rows=await sql.query<{id:string;user_id:string;amount_paise:number;currency:string;provider_payment_id:string|null;purpose:string}>("select id,user_id,amount_paise,currency,provider_payment_id,purpose from public.bridge_payments where provider_order_id=$1 limit 1",[opts.orderId]);
  const payment=rows[0]; if(!payment||payment.purpose!=="service_order") throw new Error("Unknown service payment order"); if(captured.amount!==payment.amount_paise||captured.currency!==payment.currency||payment.currency!=="INR") throw new Error("Amount or currency mismatch"); if(payment.provider_payment_id&&payment.provider_payment_id!==opts.paymentId) throw new Error("Order already linked to another payment"); if(opts.actorUserId&&opts.actorUserId!==payment.user_id) throw new Error("Payment does not belong to this account");
  await sql.query("update public.bridge_payments set status='captured',provider_payment_id=$1,verified_at=now() where id=$2 and status<>'captured'",[opts.paymentId,payment.id]);
  const order=await sql.query<{id:string;quote_id:string;status:string}>("select id,quote_id,status from public.bridge_service_orders where payment_id=$1 limit 1",[payment.id]); if(!order[0]) throw new Error("Service order is missing");
  if(order[0].status==="PAYMENT_PENDING"){ await sql.query("update public.bridge_service_orders set status='PAID',updated_at=now() where id=$1 and status='PAYMENT_PENDING'",[order[0].id]); await sql.query("update public.bridge_service_quotes set status='PAID',paid_at=now(),updated_at=now() where id=$1",[order[0].quote_id]); await sql.query("insert into public.bridge_service_order_events(order_id,from_status,to_status,actor_user_id,note) values($1,'PAYMENT_PENDING','PAID',$2,'service payment captured')",[order[0].id,opts.actorUserId??payment.user_id]); const q=await sql.query<{invoice_number:string;subtotal_paise:number;tax_paise:number;total_paise:number}>("select quote_number,subtotal_paise,tax_paise,total_paise from public.bridge_service_quotes where id=$1",[order[0].quote_id]); if(q[0]){const invoiceNumber="CRI-"+q[0].invoice_number; await sql.query("insert into public.bridge_service_invoices(order_id,invoice_number,status,subtotal_paise,tax_paise,total_paise,currency,paid_at) values($1,$2,'PAID',$3,$4,$5,'INR',now()) on conflict(order_id) do update set status='PAID',paid_at=now()",[order[0].id,invoiceNumber,q[0].subtotal_paise,q[0].tax_paise,q[0].total_paise]); }}
  await writeAudit({actorUserId:opts.actorUserId??payment.user_id,action:"service.payment.captured",entityType:"bridge_service_order",entityId:order[0].id,metadata:{paymentId:payment.id}}); return {paymentId:payment.id,orderId:order[0].id,paid:true};
}

export const createServicePaymentOrderFn=createServerFn({method:"POST"}).middleware([authMiddleware]).validator(z.object({orderId:z.string().uuid(),idempotencyKey:z.string().min(8).max(80)})).handler(async({context,data})=>{assertNotDevUser(context.userId);const actor=await requireVerifiedActor(context.userId);assertPermission(actor,"service.order_create");return createServicePaymentOrder({orderId:data.orderId,actorUserId:actor.userId,idempotencyKey:data.idempotencyKey});});
export const verifyServicePayment=createServerFn({method:"POST"}).middleware([authMiddleware]).validator(z.object({orderId:z.string().min(4),paymentId:z.string().min(4),signature:z.string().min(8)})).handler(async({context,data})=>{assertNotDevUser(context.userId);const actor=await requireVerifiedActor(context.userId);const secret=bridgeEnv.razorpayKeySecret();if(!secret)throw new Error("Razorpay is not configured");if(!verifyRazorpaySignature({secret,body:paymentVerifyBody(data.orderId,data.paymentId),signature:data.signature}))throw new Error("Invalid payment signature");return captureServicePayment({orderId:data.orderId,paymentId:data.paymentId,actorUserId:actor.userId});});


export const fulfillServiceOrder=createServerFn({method:"POST"}).middleware([authMiddleware]).validator(z.object({orderId:z.string().uuid(),status:z.enum(["IN_PROGRESS","COMPLETED"]),note:z.string().max(500).optional()})).handler(async({context,data})=>{assertNotDevUser(context.userId);const actor=await requireVerifiedActor(context.userId);assertPermission(actor,"service.fulfill");const sql=await getSql();const rows=await sql.query<{id:string;status:string;user_id:string}>("select id,status,user_id from public.bridge_service_orders where id=$1 limit 1",[data.orderId]);const order=rows[0];if(!order)throw new Error("Service order not found");if(data.status==="IN_PROGRESS"&&order.status!=="PAID")throw new Error("Service order must be paid before work starts");if(data.status==="COMPLETED"&&order.status!=="IN_PROGRESS")throw new Error("Service order must be in progress before completion");await sql.query("update public.bridge_service_orders set status=$1,completed_at=case when $1='COMPLETED' then now() else completed_at end,updated_at=now() where id=$2",[data.status,data.orderId]);await sql.query("update public.bridge_service_quotes set status=$1,updated_at=now() where id=(select quote_id from public.bridge_service_orders where id=$2)",[data.status,data.orderId]);await sql.query("insert into public.bridge_service_order_events(order_id,from_status,to_status,actor_user_id,note) values($1,$2,$3,$4,$5)",[data.orderId,order.status,data.status,actor.userId,data.note??"service order status updated"]);await writeAudit({actorUserId:actor.userId,action:"service.order_status_changed",entityType:"bridge_service_order",entityId:data.orderId,metadata:{from:order.status,to:data.status}});return {orderId:data.orderId,status:data.status};});
