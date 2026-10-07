import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, canOperateOnTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { bridgeEnv } from "./env";
import { paymentVerifyBody, verifyRazorpaySignature } from "./razorpay-crypto";
import { destinationSchema, detectRequiredWork, type DetectedAsset, type RequiredWork } from "./service-pricing";
import { calculateServiceLine, calculateRefundSplit, calculateNetProfit } from "./commercial-math";

const quoteInputSchema = z.object({
  titleId: z.string().min(8),
  destinations: z.array(destinationSchema).min(1).max(20),
  subtitleLanguages: z.array(z.string().min(2).max(80)).max(10).default([]),
  requestedDubbingLanguages: z.array(z.string().min(2).max(80)).max(10).default([]),
});

type ActiveRate = {
  id: string;
  base_price_paise: number | null;
  minimum_price_paise: number | null;
  version: number;
  cost_basis_paise: number | null;
  target_margin_percent: number | null;
  pricing_config: Record<string, unknown>;
};

type CatalogRow = {
  name: string;
  classification: "BILLABLE" | "INCLUDED" | "INTERNAL" | "PASS_THROUGH";
  pricing_method: string;
  unit_label: string;
};

type RazorpayPayment = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
  fee?: number | null;
  tax?: number | null;
  method?: string | null;
};

async function loadAssetEvidence(titleId: string) {
  const sql = await getSql();
  return sql.query<{
    kind: string;
    ready: boolean;
    source: DetectedAsset["source"];
    language: string | null;
  }>(
    "select kind, true as ready, 'legacy_asset'::text as source, null::text as language from public.bridge_assets where title_id=$1 union all select case when asset_group='VIDEO' then 'master' when asset_group='AUDIO' then 'audio' when asset_group='SUBTITLE' then 'subtitle' when asset_group='ARTWORK' then 'poster' else lower(asset_group) end as kind, (processing_state='PASSED') as ready, 'asset_version'::text as source, language from public.bridge_asset_versions where title_id=$1",
    [titleId],
  );
}

async function loadQcPassed(titleId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ passed: boolean }>(
    "select exists (select 1 from public.bridge_qc_cases where title_id=$1 and status='PASSED') as passed",
    [titleId],
  );
  return rows[0]?.passed === true;
}

async function getActiveRate(serviceCode: string) {
  const sql = await getSql();
  const rows = await sql.query<ActiveRate>(
    "select id,base_price_paise,minimum_price_paise,version,cost_basis_paise,target_margin_percent,pricing_config from public.bridge_service_rates where service_code=$1 and active=true and currency='INR' and effective_from<=now() and (effective_to is null or effective_to>now()) order by effective_from desc,version desc limit 1",
    [serviceCode],
  );
  if (!rows[0] || rows[0].base_price_paise === null) {
    throw new Error("RATE_CONFIGURATION_REQUIRED:" + serviceCode);
  }
  return rows[0];
}

async function getCatalog(serviceCode: string) {
  const sql = await getSql();
  const rows = await sql.query<CatalogRow>(
    "select name,classification,pricing_method,unit_label from public.bridge_service_catalog where code=$1 and active=true limit 1",
    [serviceCode],
  );
  if (!rows[0]) throw new Error("SERVICE_NOT_ACTIVE:" + serviceCode);
  return rows[0];
}

async function getTaxRate() {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; rate_percent: number }>(
    "select id,rate_percent from public.bridge_tax_rates where active=true and currency='INR' and effective_from<=now() and (effective_to is null or effective_to>now()) order by effective_from desc limit 1",
    [],
  );
  if (!rows[0]) throw new Error("TAX_CONFIGURATION_REQUIRED");
  return rows[0];
}

function quantityFor(method: string, requestedQuantity: number) {
  return [
    "PER_FINISHED_MINUTE",
    "PER_DESTINATION",
    "PER_LANGUAGE",
    "PER_REVISION",
    "PER_GB",
    "PER_HOUR",
    "PER_MONTH",
    "PER_TRANSACTION",
    "PER_ASSET",
  ].includes(method)
    ? requestedQuantity
    : 1;
}

export async function captureServicePayment(opts:{orderId:string;paymentId:string;actorUserId?:string|null}){
  const captured=await razorpayFetch<{id:string;order_id:string;status:string;amount:number;currency:string;fee?:number|null;tax?:number|null}>("/payments/"+opts.paymentId); if(captured.status!=="captured"||captured.order_id!==opts.orderId) throw new Error("Payment is not captured or does not match order");
  const sql=await getSql(); const rows=await sql.query<{id:string;user_id:string;title_id:string|null;amount_paise:number;currency:string;provider_payment_id:string|null;purpose:string}>("select id,user_id,title_id,amount_paise,currency,provider_payment_id,purpose from public.bridge_payments where provider_order_id=$1 limit 1",[opts.orderId]);
  const payment=rows[0]; if(!payment||payment.purpose!=="service_order") throw new Error("Unknown service payment order"); if(captured.amount!==payment.amount_paise||captured.currency!==payment.currency||payment.currency!=="INR") throw new Error("Amount or currency mismatch"); if(payment.provider_payment_id&&payment.provider_payment_id!==opts.paymentId) throw new Error("Order already linked to another payment"); if(opts.actorUserId&&opts.actorUserId!==payment.user_id) throw new Error("Payment does not belong to this account");
  await sql.query("update public.bridge_payments set status='captured',provider_payment_id=$1,verified_at=now() where id=$2 and status<>'captured'",[opts.paymentId,payment.id]);
  const order=await sql.query<{id:string;quote_id:string;status:string}>("select id,quote_id,status from public.bridge_service_orders where payment_id=$1 limit 1",[payment.id]); if(!order[0]) throw new Error("Service order is missing");
  if(order[0].status==="PAYMENT_PENDING"){
    await sql.query("update public.bridge_service_orders set status='PAID',updated_at=now() where id=$1 and status='PAYMENT_PENDING'",[order[0].id]);
    await sql.query("update public.bridge_service_quotes set status='PAID',paid_at=now(),updated_at=now() where id=$1",[order[0].quote_id]);
    await sql.query("insert into public.bridge_service_order_events(order_id,from_status,to_status,actor_user_id,note) values($1,'PAYMENT_PENDING','PAID',$2,'service payment captured')",[order[0].id,opts.actorUserId??payment.user_id]);
    const q=await sql.query<{invoice_number:string;subtotal_paise:number;tax_paise:number;total_paise:number}>("select quote_number as invoice_number,subtotal_paise,tax_paise,total_paise from public.bridge_service_quotes where id=$1",[order[0].quote_id]);
    if(q[0]){
      const invoiceNumber="CRI-"+q[0].invoice_number;
      await sql.query("insert into public.bridge_service_invoices(order_id,invoice_number,status,subtotal_paise,tax_paise,total_paise,currency,paid_at) values($1,$2,'PAID',$3,$4,$5,'INR',now()) on conflict(order_id) do update set status='PAID',paid_at=now()",[order[0].id,invoiceNumber,q[0].subtotal_paise,q[0].tax_paise,q[0].total_paise]);
      await sql.query("insert into public.bridge_financial_ledger(title_id,service_order_id,payment_id,entry_type,classification,amount_paise,currency,reference,metadata) values($1,$2,$3,'REVENUE','BILLABLE',$4,'INR',$5,$6::jsonb)",[payment.title_id ?? null,order[0].id,payment.id,q[0].subtotal_paise,invoiceNumber,JSON.stringify({source:"service_order",quoteId:order[0].quote_id})]);
      if(q[0].tax_paise > 0) await sql.query("insert into public.bridge_financial_ledger(title_id,service_order_id,payment_id,entry_type,classification,amount_paise,currency,reference,metadata) values($1,$2,$3,'TAX','INTERNAL',$4,'INR',$5,$6::jsonb)",[payment.title_id ?? null,order[0].id,payment.id,q[0].tax_paise,invoiceNumber,JSON.stringify({source:"service_order"} )]);
      if((captured.fee ?? 0) > 0) await sql.query("insert into public.bridge_financial_ledger(title_id,service_order_id,payment_id,entry_type,classification,amount_paise,currency,reference,metadata) values($1,$2,$3,'PAYMENT_FEE','PASS_THROUGH',$4,'INR',$5,$6::jsonb)",[payment.title_id ?? null,order[0].id,payment.id,captured.fee!,invoiceNumber,JSON.stringify({provider:"razorpay"})]);
    }

    const assets = await loadAssetEvidence(title.id);
    const qcPassed = await loadQcPassed(title.id);
    const plan = detectRequiredWork({
      runtimeMinutes: title.runtimeMinutes,
      destinations: data.destinations,
      assets,
      subtitleLanguages: data.subtitleLanguages,
      requestedDubbingLanguages: data.requestedDubbingLanguages,
      qcPassed,
    });

    const lines: Array<{
      serviceCode: string;
      rateId: string;
      rateVersion: number;
      classification: CatalogRow["classification"];
      pricingMethod: string;
      unitLabel: string;
      quantity: number;
      unitPricePaise: number;
      lineTotalPaise: number;
      costBasisPaise: number;
      estimatedMarginPaise: number;
      evidence: RequiredWork;
    }> = [];

    for (const work of plan.requiredWork) {
      const [rate, catalog] = await Promise.all([
        getActiveRate(work.serviceCode),
        getCatalog(work.serviceCode),
      ]);

      const quantity = quantityFor(catalog.pricing_method, work.quantity);
      const lineFinancials = calculateServiceLine({
        unitPricePaise: safeAmount(rate.base_price_paise),
        minimumPricePaise: safeAmount(rate.minimum_price_paise ?? 0),
        quantity,
        costBasisPaise: safeAmount(rate.cost_basis_paise ?? 0),
      });
      const unitPrice = safeAmount(rate.base_price_paise);
      const lineTotal = lineFinancials.lineTotalPaise;
      const estimatedCost = lineFinancials.costPaise;
      lines.push({
        serviceCode: work.serviceCode,
        rateId: rate.id,
        rateVersion: rate.version,
        classification: catalog.classification,
        pricingMethod: catalog.pricing_method,
        unitLabel: catalog.unit_label,
        quantity,
        unitPricePaise: unitPrice,
        lineTotalPaise: lineTotal,
        costBasisPaise: estimatedCost,
        estimatedMarginPaise: lineFinancials.estimatedMarginPaise,
        evidence: work,
      });
    }

    const subtotal = lines
      .filter((x) => x.classification === "BILLABLE" || x.classification === "PASS_THROUGH")
      .reduce((sum, x) => sum + x.lineTotalPaise, 0);

    const estimatedCost = lines.reduce((sum, x) => sum + x.costBasisPaise, 0);
    const estimatedMargin = subtotal - estimatedCost;
    const tax = await getTaxRate();
    const taxPaise = Math.round(subtotal * Number(tax.rate_percent) / 100);
    const total = subtotal + taxPaise;

    const sql = await getSql();
    const quoteNumber =
      "CRQ-" +
      new Date().toISOString().slice(0, 10).replaceAll("-", "") +
      "-" +
      randomBytes(4).toString("hex").toUpperCase();

    const quote = await sql.query<{ id: string }>(
      "insert into public.bridge_service_quotes(quote_number,user_id,title_id,status,runtime_minutes,selected_destinations,detected_assets,required_work,pricing_snapshot,subtotal_paise,tax_paise,total_paise,estimated_cost_paise,estimated_margin_paise) values($1,$2,$3,'QUOTED',$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13) returning id",
      [
        quoteNumber,
        actor.userId,
        title.id,
        title.runtimeMinutes,
        JSON.stringify(data.destinations),
        JSON.stringify(plan.detectedAssets),
        JSON.stringify(plan.requiredWork),
        JSON.stringify({
          taxRateId: tax.id,
          taxRatePercent: Number(tax.rate_percent),
          rates: lines.map((x) => ({
            serviceCode: x.serviceCode,
            rateId: x.rateId,
            version: x.rateVersion,
            unitPricePaise: x.unitPricePaise,
            costBasisPaise: x.costBasisPaise,
          })),
        }),
        subtotal,
        taxPaise,
        total,
        estimatedCost,
        estimatedMargin,
      ],
    );

    for (const line of lines) {
      await sql.query(
        "insert into public.bridge_service_quote_lines(quote_id,service_code,rate_id,classification,pricing_method,unit_label,quantity,unit_price_paise,line_total_paise,cost_basis_paise,estimated_margin_paise,evidence,pricing_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)",
        [
          quote[0].id,
          line.serviceCode,
          line.rateId,
          line.classification,
          line.pricingMethod,
          line.unitLabel,
          line.quantity,
          line.unitPricePaise,
          line.lineTotalPaise,
          line.costBasisPaise,
          line.estimatedMarginPaise,
          JSON.stringify(line.evidence),
          JSON.stringify({
            rateVersion: line.rateVersion,
            rateId: line.rateId,
            unitPricePaise: line.unitPricePaise,
            costBasisPaise: line.costBasisPaise,
          }),
        ],
      );
    }

    await writeAudit({
      actorUserId: actor.userId,
      action: "service.quote_created",
      entityType: "bridge_service_quote",
      entityId: quote[0].id,
      metadata: { titleId: title.id, quoteNumber, subtotal, taxPaise, total, estimatedCost },
    });

    return {
      quoteId: quote[0].id,
      quoteNumber,
      status: "QUOTED",
      currency: "INR",
      subtotalPaise: subtotal,
      taxPaise,
      totalPaise: total,
      estimatedCostPaise: estimatedCost,
      estimatedMarginPaise: estimatedMargin,
      detectedAssets: plan.detectedAssets,
      requiredWork: plan.requiredWork,
      lines,
    };
  });

export const acceptServiceQuote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ quoteId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "service.order_create");

    const sql = await getSql();
    const result = await sql.transaction(async (tx) => {
      const rows = await tx.query<{
        id: string;
        user_id: string;
        title_id: string;
        status: string;
        total_paise: number;
        currency: string;
      }>(
        "select id,user_id,title_id,status,total_paise,currency from public.bridge_service_quotes where id=$1 for update",
        [data.quoteId],
      );
      const quote = rows[0];
      if (!quote || quote.user_id !== actor.userId || quote.status !== "QUOTED") {
        throw new Error("Quote is unavailable");
      }

      const locked = await tx.query<{ id: string }>(
        "update public.bridge_service_quotes set status='ACCEPTED',accepted_at=now(),pricing_locked_at=now(),pricing_locked_by=$2,updated_at=now() where id=$1 and status='QUOTED' returning id",
        [quote.id, actor.userId],
      );
      if (!locked[0]) throw new Error("Quote changed before acceptance");

      const order = await tx.query<{ id: string }>(
        "insert into public.bridge_service_orders(quote_id,user_id,title_id,status,amount_paise,currency) values($1,$2,$3,'PAYMENT_PENDING',$4,$5) on conflict(quote_id) do nothing returning id",
        [quote.id, actor.userId, quote.title_id, quote.total_paise, quote.currency],
      );
      if (!order[0]) throw new Error("Service order already exists");

      await tx.query(
        "insert into public.bridge_service_order_events(order_id,to_status,actor_user_id,note) values($1,'PAYMENT_PENDING',$2,'service quote accepted')",
        [order[0].id, actor.userId],
      );

      return { orderId: order[0].id, amountPaise: quote.total_paise, currency: quote.currency, quoteId: quote.id };
    });

    await writeAudit({
      actorUserId: actor.userId,
      action: "service.quote_accepted",
      entityType: "bridge_service_order",
      entityId: result.orderId,
      metadata: { quoteId: result.quoteId, amountPaise: result.amountPaise },
    });

    return result;
  });

async function razorpayFetch<T>(path: string, init: RequestInit = {}) {
  const keyId = bridgeEnv.razorpayKeyId();
  const keySecret = bridgeEnv.razorpayKeySecret();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");

  const auth = Buffer.from(keyId + ":" + keySecret).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1" + path, {
    ...init,
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error("Razorpay request failed");
  return (await res.json()) as T;
}

async function findCapturedPayment(orderId: string) {
  const response = await razorpayFetch<{ items?: RazorpayPayment[] }>(
    "/orders/" + encodeURIComponent(orderId) + "/payments",
  );
  const payment = (response.items ?? []).find((item) => item.status === "captured");
  if (!payment) throw new Error("No captured payment found for order");
  return payment;
}

export async function createServicePaymentOrder(opts: {
  orderId: string;
  actorUserId: string;
  idempotencyKey: string;
}) {
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    user_id: string;
    status: string;
    amount_paise: number;
    currency: string;
    title_id: string;
  }>(
    "select id,user_id,status,amount_paise,currency,title_id from public.bridge_service_orders where id=$1 limit 1",
    [opts.orderId],
  );
  const order = rows[0];
  if (!order || order.user_id !== opts.actorUserId || order.status !== "PAYMENT_PENDING") {
    throw new Error("Service order unavailable");
  }

  const existing = await sql.query<{
    id: string;
    provider_order_id: string | null;
    amount_paise: number;
  }>(
    "select id,provider_order_id,amount_paise from public.bridge_payments where user_id=$1 and purpose='service_order' and idempotency_key=$2 limit 1",
    [opts.actorUserId, opts.idempotencyKey],
  );

  const keyId = bridgeEnv.razorpayKeyId();
  if (!keyId) throw new Error("Razorpay is not configured");

  if (existing[0]?.provider_order_id) {
    return {
      orderId: existing[0].provider_order_id,
      amountPaise: existing[0].amount_paise,
      currency: order.currency,
      keyId,
      paymentRecordId: existing[0].id,
    };
  }

  const rz = await razorpayFetch<{ id: string }>(
    "/orders",
    {
      method: "POST",
      body: JSON.stringify({
        amount: order.amount_paise,
        currency: order.currency,
        receipt: opts.idempotencyKey.slice(0, 40),
        notes: { serviceOrderId: order.id, titleId: order.title_id, userId: opts.actorUserId, surface: "bridge" },
      }),
    },
  );

  const paymentId = randomBytes(16).toString("hex");
  const inserted = await sql.query<{ id: string }>(
    "insert into public.bridge_payments(id,user_id,title_id,purpose,provider_order_id,amount_paise,currency,status,idempotency_key) values($1,$2,$3,'service_order',$4,$5,$6,'created',$7) on conflict(user_id,purpose,idempotency_key) do nothing returning id",
    [
      paymentId,
      opts.actorUserId,
      order.title_id,
      rz.id,
      order.amount_paise,
      order.currency,
      opts.idempotencyKey,
    ],
  );
  if (!inserted[0]) throw new Error("Service payment order already exists");

  await sql.query(
    "update public.bridge_service_orders set payment_id=$1,updated_at=now() where id=$2 and payment_id is null",
    [paymentId, order.id],
  );

  return {
    orderId: rz.id,
    amountPaise: order.amount_paise,
    currency: order.currency,
    keyId,
    paymentRecordId: paymentId,
  };
}

export async function captureServicePayment(opts: {
  orderId: string;
  paymentId: string;
  actorUserId?: string | null;
  sourceEventId?: string | null;
}) {
  const captured = await razorpayFetch<RazorpayPayment>("/payments/" + encodeURIComponent(opts.paymentId));
  if (captured.status !== "captured" || captured.order_id !== opts.orderId) {
    throw new Error("Payment is not captured or does not match order");
  }

  const sql = await getSql();
  const result = await sql.transaction(async (tx) => {
    const paymentRows = await tx.query<{
      id: string;
      user_id: string;
      amount_paise: number;
      currency: string;
      provider_payment_id: string | null;
      purpose: string;
      title_id: string | null;
    }>(
      "select id,user_id,amount_paise,currency,provider_payment_id,purpose,title_id from public.bridge_payments where provider_order_id=$1 for update",
      [opts.orderId],
    );
    const payment = paymentRows[0];

    if (!payment || payment.purpose !== "service_order") {
      throw new Error("Unknown service payment order");
    }
    if (
      captured.amount !== payment.amount_paise ||
      captured.currency !== payment.currency ||
      payment.currency !== "INR"
    ) {
      throw new Error("Amount or currency mismatch");
    }
    if (payment.provider_payment_id && payment.provider_payment_id !== opts.paymentId) {
      throw new Error("Order already linked to another payment");
    }
    if (opts.actorUserId && opts.actorUserId !== payment.user_id) {
      throw new Error("Payment does not belong to this account");
    }

    await tx.query(
      "update public.bridge_payments set status='captured',provider_payment_id=$1,provider_fee_paise=$2,provider_tax_paise=$3,verified_at=now() where id=$4 and status<>'captured'",
      [opts.paymentId, safeAmount(captured.fee ?? 0), safeAmount(captured.tax ?? 0), payment.id],
    );

    const orderRows = await tx.query<{
      id: string;
      quote_id: string;
      title_id: string;
      status: string;
      payment_id: string | null;
    }>(
      "select id,quote_id,title_id,status,payment_id from public.bridge_service_orders where payment_id=$1 for update",
      [payment.id],
    );
    const order = orderRows[0];
    if (!order) throw new Error("Service order is missing");

    if (order.status === "PAYMENT_PENDING") {
      const quoteRows = await tx.query<{
        id: string;
        quote_number: string;
        subtotal_paise: number;
        tax_paise: number;
        total_paise: number;
        refunded_amount_paise: number;
      }>(
        "select id,quote_number,subtotal_paise,tax_paise,total_paise,refunded_amount_paise from public.bridge_service_quotes where id=$1 for update",
        [order.quote_id],
      );
      const quote = quoteRows[0];
      if (!quote) throw new Error("Service quote is missing");

      const lines = await tx.query<{
        id: string;
        service_code: string;
        classification: "BILLABLE" | "INCLUDED" | "INTERNAL" | "PASS_THROUGH";
        unit_label: string;
        quantity: number;
        unit_price_paise: number;
        line_total_paise: number;
        cost_basis_paise: number;
      }>(
        "select id,service_code,classification,unit_label,quantity,unit_price_paise,line_total_paise,cost_basis_paise from public.bridge_service_quote_lines where quote_id=$1 order by created_at,id",
        [quote.id],
      );

      await tx.query(
        "update public.bridge_service_orders set status='PAID',updated_at=now() where id=$1 and status='PAYMENT_PENDING'",
        [order.id],
      );
      await tx.query(
        "update public.bridge_service_quotes set status='PAID',paid_at=now(),updated_at=now() where id=$1 and status='ACCEPTED'",
        [quote.id],
      );
      await tx.query(
        "insert into public.bridge_service_invoices(order_id,invoice_number,status,subtotal_paise,tax_paise,total_paise,currency,paid_at,refunded_amount_paise) values($1,$2,'PAID',$3,$4,$5,'INR',now(),0) on conflict(order_id) do update set status='PAID',paid_at=now()",
        [order.id, "CRI-" + quote.quote_number, quote.subtotal_paise, quote.tax_paise, quote.total_paise],
      );
      await tx.query(
        "insert into public.bridge_service_order_events(order_id,from_status,to_status,actor_user_id,note) values($1,'PAYMENT_PENDING','PAID',$2,'service payment captured') on conflict do nothing",
        [order.id, opts.actorUserId ?? payment.user_id],
      );

      for (const line of lines) {
        if (line.classification !== "BILLABLE" && line.classification !== "PASS_THROUGH") continue;
        await insertLedger(tx, {
          titleId: payment.title_id,
          orderId: order.id,
          paymentId: payment.id,
          serviceCode: line.service_code,
          entryType: "REVENUE",
          classification: line.classification,
          amountPaise: Number(line.line_total_paise),
          reference: "CRI-" + quote.quote_number,
          idempotencyKey: ledgerKey(["revenue", order.id, line.id]),
          sourceEventId: opts.sourceEventId,
          metadata: {
            serviceCode: line.service_code,
            quantity: Number(line.quantity),
            unitPricePaise: Number(line.unit_price_paise),
            costBasisPaise: Number(line.cost_basis_paise),
          },
        });
      }

      await insertLedger(tx, {
        titleId: payment.title_id,
        orderId: order.id,
        paymentId: payment.id,
        entryType: "TAX",
        classification: "INTERNAL",
        amountPaise: Number(quote.tax_paise),
        reference: "CRI-" + quote.quote_number,
        idempotencyKey: ledgerKey(["tax", order.id]),
        sourceEventId: opts.sourceEventId,
        metadata: { source: "customer_invoice", rateSnapshot: "quote.pricing_snapshot" },
      });

      if (safeAmount(captured.fee ?? 0) > 0) {
        await tx.query(
          "update public.bridge_payments set provider_fee_paise=$1 where id=$2",
          [safeAmount(captured.fee ?? 0), payment.id],
        );
        await insertLedger(tx, {
          titleId: payment.title_id,
          orderId: order.id,
          paymentId: payment.id,
          entryType: "PAYMENT_FEE",
          classification: "INTERNAL",
          amountPaise: safeAmount(captured.fee ?? 0),
          reference: "RAZORPAY:" + opts.paymentId,
          idempotencyKey: ledgerKey(["payment_fee", opts.paymentId]),
          sourceEventId: opts.sourceEventId,
          metadata: { provider: "razorpay", providerTaxPaise: safeAmount(captured.tax ?? 0) },
        });
      }

      await applySettlementRules(
        tx,
        order.id,
        order.title_id,
        quote.subtotal_paise,
        quote.tax_paise,
        opts.sourceEventId,
      );

      return {
        paymentId: payment.id,
        orderId: order.id,
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        subtotalPaise: Number(quote.subtotal_paise),
        taxPaise: Number(quote.tax_paise),
        totalPaise: Number(quote.total_paise),
      };
    }

    return { paymentId: payment.id, orderId: order.id, quoteId: null, quoteNumber: null };
  });

  if (result.orderId) {
    await writeAudit({
      actorUserId: opts.actorUserId ?? "razorpay-webhook",
      action: "service.payment.captured",
      entityType: "bridge_service_order",
      entityId: result.orderId,
      metadata: {
        paymentId: result.paymentId,
        sourceEventId: opts.sourceEventId ?? null,
        amountPaise: result.totalPaise ?? null,
      },
    });
  }

  return { ...result, paid: true };
}

export async function processServiceRefund(opts: {
  refundId: string;
  paymentId: string;
  amountPaise: number;
  sourceEventId?: string | null;
}) {
  const sql = await getSql();
  const result = await sql.transaction(async (tx) => {
    const paymentRows = await tx.query<{
      id: string;
      user_id: string;
      title_id: string | null;
      provider_payment_id: string | null;
      amount_paise: number;
      refunded_amount_paise: number;
      purpose: string;
    }>(
      "select id,user_id,title_id,provider_payment_id,amount_paise,refunded_amount_paise,purpose from public.bridge_payments where provider_payment_id=$1 for update",
      [opts.paymentId],
    );
    const payment = paymentRows[0];
    if (!payment || payment.purpose !== "service_order") throw new Error("Unknown service refund payment");

    const orderRows = await tx.query<{
      id: string;
      quote_id: string;
      title_id: string;
      status: string;
    }>(
      "select id,quote_id,title_id,status from public.bridge_service_orders where payment_id=$1 for update",
      [payment.id],
    );
    const order = orderRows[0];
    if (!order) throw new Error("Service order is missing");

    const quoteRows = await tx.query<{
      id: string;
      quote_number: string;
      subtotal_paise: number;
      tax_paise: number;
      total_paise: number;
      refunded_amount_paise: number;
    }>(
      "select id,quote_number,subtotal_paise,tax_paise,total_paise,refunded_amount_paise from public.bridge_service_quotes where id=$1 for update",
      [order.quote_id],
    );
    const quote = quoteRows[0];
    if (!quote) throw new Error("Service quote is missing");

    const requested = safeAmount(opts.amountPaise);
    const remaining = Number(payment.amount_paise) - Number(payment.refunded_amount_paise ?? 0);
    if (requested <= 0 || requested > remaining) throw new Error("Refund exceeds captured amount");

    const existing = await tx.query<{ id: string }>(
      "select id from public.bridge_financial_ledger where idempotency_key=$1 limit 1",
      [ledgerKey(["refund", opts.refundId])],
    );
    if (existing[0]) return { paymentId: payment.id, orderId: order.id, refundAmountPaise: requested, duplicate: true };

    const totalRefunded = Number(payment.refunded_amount_paise ?? 0) + requested;
    const ratio = Number(quote.total_paise) > 0 ? requested / Number(quote.total_paise) : 0;
    const refundSplit = calculateRefundSplit({
      refundTotalPaise: requested,
      invoiceSubtotalPaise: Number(quote.subtotal_paise),
      invoiceTaxPaise: Number(quote.tax_paise),
      invoiceTotalPaise: Number(quote.total_paise),
    });
    const refundTax = refundSplit.refundTaxPaise;
    const refundRevenue = refundSplit.refundRevenuePaise;

    await tx.query(
      "update public.bridge_payments set refunded_amount_paise=$1,status=case when $1>=amount_paise then 'refunded' else status end where id=$2",
      [totalRefunded, payment.id],
    );
    await tx.query(
      "update public.bridge_service_orders set refunded_amount_paise=refunded_amount_paise+$1,status=case when refunded_amount_paise+$1>=amount_paise then 'REFUNDED' else status end,updated_at=now() where id=$2",
      [requested, order.id],
    );
    await tx.query(
      "update public.bridge_service_quotes set refunded_amount_paise=refunded_amount_paise+$1,status=case when refunded_amount_paise+$1>=total_paise then 'REFUNDED' else status end,updated_at=now() where id=$2",
      [requested, quote.id],
    );
    await tx.query(
      "update public.bridge_service_invoices set refunded_amount_paise=refunded_amount_paise+$1,status=case when refunded_amount_paise+$1>=total_paise then 'REFUNDED' else status end where order_id=$2",
      [requested, order.id],
    );

    await insertLedger(tx, {
      titleId: payment.title_id,
      orderId: order.id,
      paymentId: payment.id,
      entryType: "REFUND",
      classification: "BILLABLE",
      amountPaise: refundRevenue,
      reference: "RAZORPAY_REFUND:" + opts.refundId,
      idempotencyKey: ledgerKey(["refund", opts.refundId, "revenue"]),
      sourceEventId: opts.sourceEventId,
      metadata: { refundAmountPaise: requested, refundRevenuePaise: refundRevenue, taxPaise: refundTax, ratio },
    });

    if (refundTax > 0) {
      await insertLedger(tx, {
        titleId: payment.title_id,
        orderId: order.id,
        paymentId: payment.id,
        entryType: "TAX",
        classification: "INTERNAL",
        amountPaise: refundTax,
        reference: "RAZORPAY_REFUND:" + opts.refundId,
        idempotencyKey: ledgerKey(["refund", opts.refundId, "tax"]),
        sourceEventId: opts.sourceEventId,
        metadata: { reversal: true },
      });
    }

    return { paymentId: payment.id, orderId: order.id, refundAmountPaise: requested, duplicate: false };
  });

  await writeAudit({
    actorUserId: "razorpay-webhook",
    action: "service.refund.processed",
    entityType: "bridge_service_order",
    entityId: result.orderId,
    metadata: { refundId: opts.refundId, paymentId: result.paymentId, amountPaise: result.refundAmountPaise },
  });

  return result;
}

export async function processServiceChargeback(opts: {
  chargebackId: string;
  paymentId: string;
  amountPaise: number;
  status: "OPEN" | "WON";
  sourceEventId?: string | null;
}) {
  const sql = await getSql();
  const paymentRows = await sql.query<{ id: string; user_id: string; title_id: string | null; purpose: string; chargeback_amount_paise: number }>(
    "select id,user_id,title_id,purpose,chargeback_amount_paise from public.bridge_payments where provider_payment_id=$1 limit 1",
    [opts.paymentId],
  );
  const payment = paymentRows[0];
  if (!payment || payment.purpose !== "service_order") throw new Error("Unknown service chargeback payment");

  const orderRows = await sql.query<{ id: string }>(
    "select id from public.bridge_service_orders where payment_id=$1 limit 1",
    [payment.id],
  );
  const order = orderRows[0];
  if (!order) throw new Error("Service order is missing");

  const amount = safeAmount(opts.amountPaise);
  if (opts.status === "OPEN") {
    await sql.transaction(async (tx) => {
      const updated = await tx.query<{ id: string }>(
        "update public.bridge_payments set chargeback_amount_paise=greatest(chargeback_amount_paise,$1) where id=$2 returning id",
        [amount, payment.id],
      );
      if (!updated[0]) throw new Error("Chargeback payment update failed");

      await insertLedger(tx, {
        titleId: payment.title_id,
        orderId: order.id,
        paymentId: payment.id,
        entryType: "CHARGEBACK",
        classification: "INTERNAL",
        amountPaise: amount,
        reference: "RAZORPAY_DISPUTE:" + opts.chargebackId,
        idempotencyKey: ledgerKey(["chargeback", opts.chargebackId, "open"]),
        sourceEventId: opts.sourceEventId,
        metadata: { status: opts.status },
      });
    });
  } else {
    await insertLedger(sql, {
      titleId: payment.title_id,
      orderId: order.id,
      paymentId: payment.id,
      entryType: "CHARGEBACK_REVERSAL",
      classification: "INTERNAL",
      amountPaise: amount,
      reference: "RAZORPAY_DISPUTE_REVERSAL:" + opts.chargebackId,
      idempotencyKey: ledgerKey(["chargeback", opts.chargebackId, "won"]),
      sourceEventId: opts.sourceEventId,
      metadata: { reversal: true },
    });
    await sql.query(
      "update public.bridge_payments set chargeback_amount_paise=greatest(0,chargeback_amount_paise-$1) where id=$2",
      [amount, payment.id],
    );
  }

  await writeAudit({
    actorUserId: "razorpay-webhook",
    action: opts.status === "OPEN" ? "service.chargeback.opened" : "service.chargeback.won",
    entityType: "bridge_service_order",
    entityId: order.id,
    metadata: { chargebackId: opts.chargebackId, paymentId: payment.id, amountPaise: amount },
  });

  return { orderId: order.id, paymentId: payment.id, amountPaise: amount, status: opts.status };
}

export const createServicePaymentOrderFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: z.string().uuid(), idempotencyKey: z.string().min(8).max(80) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "service.order_create");
    return createServicePaymentOrder({
      orderId: data.orderId,
      actorUserId: actor.userId,
      idempotencyKey: data.idempotencyKey,
    });
  });

export const verifyServicePayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: z.string().min(4), paymentId: z.string().min(4), signature: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const secret = bridgeEnv.razorpayKeySecret();
    if (!secret) throw new Error("Razorpay is not configured");
    if (
      !verifyRazorpaySignature({
        secret,
        body: paymentVerifyBody(data.orderId, data.paymentId),
        signature: data.signature,
      })
    ) {
      throw new Error("Invalid payment signature");
    }
    return captureServicePayment({
      orderId: data.orderId,
      paymentId: data.paymentId,
      actorUserId: actor.userId,
    });
  });

export const recordServiceActualCost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      orderId: z.string().uuid(),
      serviceCode: z.string().min(2).max(80).nullable().optional(),
      costType: z.enum(["INTERNAL_COST", "PASS_THROUGH", "PAYMENT_PROCESSING"]),
      amountPaise: z.number().int().nonnegative(),
      vendorReference: z.string().max(200).nullable().optional(),
      evidence: z.record(z.string(), z.unknown()).default({}),
      idempotencyKey: z.string().min(8).max(100),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.configure");

    const sql = await getSql();
    const orderRows = await sql.query<{ id: string; title_id: string }>(
      "select id,title_id from public.bridge_service_orders where id=$1 limit 1",
      [data.orderId],
    );
    const order = orderRows[0];
    if (!order) throw new Error("Service order not found");

    const costKey = "cost:" + data.idempotencyKey;
    const result = await sql.transaction(async (tx) => {
      const inserted = await tx.query<{ id: string }>(
        "insert into public.bridge_service_costs(order_id,service_code,cost_type,amount_paise,currency,source,vendor_reference,evidence,created_by,idempotency_key) values($1,$2,$3,$4,'INR','ACTUAL',$5,$6::jsonb,$7,$8) on conflict(idempotency_key) do nothing returning id",
        [
          data.orderId,
          data.serviceCode ?? null,
          data.costType,
          data.amountPaise,
          data.vendorReference ?? null,
          JSON.stringify(data.evidence),
          actor.userId,
          costKey,
        ],
      );
      if (!inserted[0]) return { costId: null, duplicate: true };

      await insertLedger(tx, {
        titleId: order.title_id,
        orderId: order.id,
        paymentId: null,
        serviceCode: data.serviceCode ?? null,
        entryType: data.costType === "PASS_THROUGH" ? "PASS_THROUGH" : data.costType === "PAYMENT_PROCESSING" ? "PAYMENT_FEE" : "INTERNAL_COST",
        classification: data.costType === "PASS_THROUGH" ? "PASS_THROUGH" : "INTERNAL",
        amountPaise: data.amountPaise,
        reference: data.vendorReference ?? null,
        idempotencyKey: costKey,
        metadata: { source: "ACTUAL", evidence: data.evidence },
      });

      return { costId: inserted[0].id, duplicate: false };
    });

    await writeAudit({
      actorUserId: actor.userId,
      action: "finance.service_cost_recorded",
      entityType: "bridge_service_cost",
      entityId: result.costId,
      metadata: { orderId: data.orderId, amountPaise: data.amountPaise, costType: data.costType },
    });

    return result;
  });

export const getCommercialFinancialSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.read");

    const sql = await getSql();
    const rows = await sql.query<{ entry_type: string; amount_paise: number }>(
      "select entry_type,coalesce(sum(amount_paise),0) as amount_paise from public.bridge_financial_ledger group by entry_type",
      [],
    );
    const totals = new Map(rows.map((r) => [r.entry_type, Number(r.amount_paise)]));
    const revenue = totals.get("REVENUE") ?? 0;
    const refunds = totals.get("REFUND") ?? 0;
    const tax = totals.get("TAX") ?? 0;
    const paymentFees = totals.get("PAYMENT_FEE") ?? 0;
    const operatingCosts = totals.get("INTERNAL_COST") ?? 0;
    const passThroughCosts = totals.get("PASS_THROUGH") ?? 0;
    const settlements = totals.get("SETTLEMENT") ?? 0;
    const chargebacks = totals.get("CHARGEBACK") ?? 0;
    const chargebackReversals = totals.get("CHARGEBACK_REVERSAL") ?? 0;
    const bridgeShareRows = await sql.query<{ amount_paise: number }>(
      "select coalesce(sum(amount_paise),0) as amount_paise from public.bridge_service_settlement_lines where beneficiary_type='BRIDGE' and status<>'CANCELLED'",
      [],
    );
    const bridgeShare = Number(bridgeShareRows[0]?.amount_paise ?? 0);

    return {
      currency: "INR",
      revenuePaise: revenue,
      refundsPaise: refunds,
      taxPaise: tax,
      paymentFeesPaise: paymentFees,
      operatingCostsPaise: operatingCosts,
      passThroughCostsPaise: passThroughCosts,
      contractualSettlementsPaise: Math.max(0, settlements - bridgeShare),
      bridgeSharePaise: bridgeShare,
      chargebacksPaise: chargebacks,
      chargebackReversalsPaise: chargebackReversals,
      netProfitBeforeBridgeSharePaise: calculateNetProfit({
        revenuePaise: revenue,
        refundsPaise: refunds,
        taxPaise: tax,
        paymentFeesPaise: paymentFees,
        operatingCostsPaise: operatingCosts,
        passThroughCostsPaise: passThroughCosts,
        settlementsPaise: (chargebacks - chargebackReversals) + Math.max(0, settlements - bridgeShare),
      }),
      netProfitAfterBridgeSharePaise: calculateNetProfit({
        revenuePaise: revenue,
        refundsPaise: refunds,
        taxPaise: tax,
        paymentFeesPaise: paymentFees,
        operatingCostsPaise: operatingCosts,
        passThroughCostsPaise: passThroughCosts,
        settlementsPaise: (chargebacks - chargebackReversals) + settlements,
      }),
    };
  });

export async function ingestRazorpayWebhook(rawBody: string, signature: string | null) {
  const secret = bridgeEnv.razorpayWebhookSecret();
  if (!secret) throw new Error("Razorpay webhook is not configured");
  const ok = verifyRazorpaySignature({ secret, body: rawBody, signature });
  if (!ok) throw new Error("Invalid webhook signature");

  const payload = JSON.parse(rawBody) as {
    event?: string;
    payload?: {
      payment?: { entity?: RazorpayPayment & { notes?: Record<string, string> } };
      order?: { entity?: { id?: string; notes?: Record<string, string> } };
      refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
      dispute?: { entity?: { id?: string; payment_id?: string; amount?: number; status?: string } };
    };
  };

  const eventName = payload.event ?? "unknown";
  const payment = payload.payload?.payment?.entity;
  const order = payload.payload?.order?.entity;
  const refund = payload.payload?.refund?.entity;
  const dispute = payload.payload?.dispute?.entity;

  const eventId =
    (payment?.id && `${eventName}:${payment.id}`) ||
    (refund?.id && `${eventName}:${refund.id}`) ||
    (dispute?.id && `${eventName}:${dispute.id}`) ||
    (order?.id && `${eventName}:${order.id}`) ||
    createHash("sha256").update(rawBody).digest("hex");

  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const sql = await getSql();

  await sql`
    insert into bridge_webhook_events (event_id,event_name,payload_hash,status)
    values (${eventId},${eventName},${payloadHash},${"received"})
    on conflict (event_id) do nothing
  `;

  const existing = await sql`
    select status,payload_hash from bridge_webhook_events where event_id = ${eventId}
  `;
  if (existing[0]?.payload_hash !== payloadHash) throw new Error("Webhook event ID collision");
  if (existing[0]?.status === "processed") return { duplicate: true };

  const claimToken = randomBytes(16).toString("hex");
  const claim = await sql`
    update bridge_webhook_events
    set status = ${"processing"},
        processing_started_at = now(),
        processing_token = ${claimToken},
        attempts = attempts + 1
    where event_id = ${eventId}
      and (
        status in ('received','failed')
        or (status = 'processing' and processing_started_at < now() - interval '2 minutes')
      )
    returning event_id
  `;
  if (!claim[0]) throw new Error("Webhook event is already processing");

  try {
    if ((eventName === "payment.captured" || eventName === "order.paid")) {
      let capturePayment = payment;
      const captureOrderId = payment?.order_id ?? order?.id ?? null;
      if (!capturePayment && captureOrderId) {
        capturePayment = await findCapturedPayment(captureOrderId);
      }
      if (capturePayment?.id && captureOrderId) {
        await captureServicePayment({
          orderId: captureOrderId,
          paymentId: capturePayment.id,
          sourceEventId: eventId,
        });
      }
    } else if (eventName === "payment.failed" && payment?.id) {
      const reason = String((payment as RazorpayPayment & { error_description?: string }).error_description ?? "Payment failed");
      await sql.query(
        "update public.bridge_payments set status='failed',provider_failure_reason=$1 where provider_order_id=$2 and purpose='service_order'",
        [reason, payment.order_id],
      );
    } else if ((eventName === "refund.processed" || eventName === "payment.refunded") && refund?.id && refund.payment_id) {
      await processServiceRefund({
        refundId: refund.id,
        paymentId: refund.payment_id,
        amountPaise: safeAmount(refund.amount ?? 0),
        sourceEventId: eventId,
      });
    } else if (eventName === "dispute.created" && dispute?.id && dispute.payment_id) {
      await processServiceChargeback({
        chargebackId: dispute.id,
        paymentId: dispute.payment_id,
        amountPaise: safeAmount(dispute.amount ?? 0),
        status: "OPEN",
        sourceEventId: eventId,
      });
    } else if (eventName === "dispute.won" && dispute?.id && dispute.payment_id) {
      await processServiceChargeback({
        chargebackId: dispute.id,
        paymentId: dispute.payment_id,
        amountPaise: safeAmount(dispute.amount ?? 0),
        status: "WON",
        sourceEventId: eventId,
      });
    }

    const completed = await sql`
      update bridge_webhook_events
      set status=${"processed"},processed_at=now(),processing_started_at=null,processing_token=null
      where event_id=${eventId} and processing_token=${claimToken}
      returning event_id
    `;
    if (!completed[0]) throw new Error("Webhook processing lease was superseded");
    return { duplicate: false, eventName };
  } catch (error) {
    await sql`
      update bridge_webhook_events
      set status=${"failed"},processing_started_at=null,processing_token=null
      where event_id=${eventId} and processing_token=${claimToken}
    `;
    throw error;
  }
}
