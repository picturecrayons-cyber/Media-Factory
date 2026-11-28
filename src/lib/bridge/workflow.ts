import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, canReadTitle, canOperateOnTitle, type Actor } from "./rbac";
import { loadTitle } from "./titles";
import { loopLicenseInput, producerSharePaise } from "./workflow-policy";
import { bridgeEnv } from "./env";
import { hasVerifiedMasterAndArtwork } from "./asset-roles";

async function audit(tx: Sql, user: string, title: string, action: string, metadata: object) {
  await tx`insert into bridge_audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    values (${user},${action},'bridge_title',${title},${JSON.stringify(metadata)})`;
}

// Business drafts are immutable. Approval/rejection is a separate reviewer action.
export async function saveLoopLicense(
  tx: Sql,
  actor: Actor,
  data: z.infer<typeof loopLicenseInput>,
) {
  data = loopLicenseInput.parse(data);
  const [title] = await tx<{
    owner_user_id: string;
    owner_account_type: string;
    owner_organization_id: string | null;
    status: string;
  }>`select owner_user_id,owner_account_type,owner_organization_id,status from bridge_titles where id=${data.titleId} for update`;
  if (
    !title ||
    !canOperateOnTitle(
      actor,
      { ownerUserId: title.owner_user_id, ownerAccountType: title.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor", ownerOrganizationId: title.owner_organization_id },
      "title.update_own",
      "title.license",
    )
  )
    throw new Error("Forbidden");
  if (new Date(data.windowEnd) <= new Date()) throw new Error("License window has expired");
  const [grant] = await tx<{ id: string }>`insert into bridge_rights_grants
    (title_id,grant_type,territories,languages,media,window_start,window_end,exclusivity,evidence,status,created_by)
    values (${data.titleId},'DISTRIBUTION',${JSON.stringify(data.territories)}::jsonb,${JSON.stringify(data.languages)}::jsonb,
      '["CRAYONS_LOOP","TVOD"]'::jsonb,${data.windowStart},${data.windowEnd},${data.exclusivity},
      ${JSON.stringify([
        {
          agreementReference: data.agreementReference,
          ownershipReference: data.ownershipReference,
          commercialTerms: {
            rightsOwnerSharePct: data.rightsOwnerSharePct,
            distributorSharePct: data.distributorSharePct,
          },
        },
      ])}::jsonb,'DRAFT',${actor.userId}) returning id`;
  await audit(tx, actor.userId, data.titleId, "license.loop_draft", { grantId: grant.id });
  return { grantId: grant.id };
}

export const submitLoopLicense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(loopLicenseInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    return (await getSql()).transaction((tx) => saveLoopLicense(tx, actor, data));
  });

const reviewInput = z.object({
  titleId: z.string().min(8),
  stage: z.enum(["QC", "LEGAL"]),
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().min(8).max(2000),
  grantId: z.string().uuid().optional(),
});

export async function reviewWorkflow(tx: Sql, actor: Actor, data: z.infer<typeof reviewInput>) {
  data = reviewInput.parse(data);
  assertPermission(actor, data.stage === "QC" ? "title.qc_review" : "title.rights_review");
  const [title] = await tx<{
    status: string;
    master_key: string | null;
    poster_key: string | null;
  }>`select status,master_key,poster_key from bridge_titles where id=${data.titleId} for update`;
  if (!title) throw new Error("Not found");
  const expected = data.stage === "QC" ? "QC_REVIEW" : "RIGHTS_REVIEW";
  if (title.status !== expected) throw new Error(`Title must be in ${expected}`);
  if (data.stage === "QC") {
    const assets = await tx<{
      id: string;
      kind: string;
      s3_key: string;
    }>`select id,kind,s3_key from bridge_assets where title_id=${data.titleId} and byte_size>0`;
    if (
      data.decision === "APPROVE" &&
      !hasVerifiedMasterAndArtwork(assets, title.master_key, title.poster_key)
    )
      throw new Error("Verified current master and artwork are required");
    await tx`insert into bridge_qc_cases(title_id,status,reviewer_findings,reviewed_by,reviewed_at)
      values (${data.titleId},${data.decision === "APPROVE" ? "PASSED" : "ACTION_REQUIRED"},
      ${JSON.stringify([{ note: data.note, masterKey: title.master_key, posterKey: title.poster_key }])}::jsonb,${actor.userId},now())`;
  } else {
    if (!data.grantId) throw new Error("Select a license draft");
    const [grant] = await tx<{
      status: string;
      window_end: string;
      created_by: string;
    }>`select status,window_end,created_by from bridge_rights_grants where id=${data.grantId} and title_id=${data.titleId} for update`;
    if (!grant || grant.status !== "DRAFT") throw new Error("License draft is unavailable");
    if (grant.created_by === actor.userId && actor.internalRole !== "super_admin")
      throw new Error("Only the verified Super Admin may approve their own license draft");
    if (data.decision === "APPROVE" && new Date(grant.window_end) <= new Date())
      throw new Error("License has expired");
    await tx`insert into bridge_legal_cases(title_id,status,evidence,reviewed_by,reviewed_at)
      values (${data.titleId},${data.decision === "APPROVE" ? "APPROVED" : "REJECTED"},
      ${JSON.stringify([{ grantId: data.grantId, note: data.note }])}::jsonb,${actor.userId},now())`;
    await tx`update bridge_rights_grants set status=${data.decision === "APPROVE" ? "VALID" : "REVOKED"} where id=${data.grantId}`;
  }
  const next =
    data.decision === "REJECT"
      ? "PREPARING"
      : data.stage === "QC"
        ? "RIGHTS_REVIEW"
        : "LICENSING_READY";
  await tx`update bridge_titles set status=${next},updated_at=now() where id=${data.titleId}`;
  await tx`insert into bridge_title_events(title_id,from_status,to_status,actor_user_id,note) values (${data.titleId},${title.status},${next},${actor.userId},${data.note})`;
  await audit(
    tx,
    actor.userId,
    data.titleId,
    `workflow.${data.stage.toLowerCase()}.${data.decision.toLowerCase()}`,
    { grantId: data.grantId ?? null },
  );
  return { status: next };
}

export const reviewTitleWorkflow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    return (await getSql()).transaction((tx) => reviewWorkflow(tx, actor, data));
  });

export const getTitleWorkflow = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (
      !title ||
      !canReadTitle(actor, title) ||
      (!actor.internalRole && actor.accountType === "buyer")
    )
      throw new Error("Not found");
    const sql = await getSql();
    const grants = await sql<{
      id: string;
      status: string;
      territories: string[];
      languages: string[];
      window_start: string | Date;
      window_end: string | Date;
      created_at: string | Date;
      exclusivity: string;
      evidence: Array<{
        agreementReference?: string;
        ownershipReference?: string;
        commercialTerms?: { rightsOwnerSharePct: number; distributorSharePct: number };
      }>;
    }>`select id,status,territories,languages,window_start,window_end,created_at,exclusivity,evidence from bridge_rights_grants where title_id=${data.titleId} order by created_at desc`;
    const qc = await sql<{
      status: string;
      reviewed_at: string | Date;
      reviewer_findings: Array<{
        note: string;
        masterKey: string | null;
        posterKey: string | null;
      }>;
    }>`select status,reviewed_at,reviewer_findings from bridge_qc_cases where title_id=${data.titleId} order by created_at desc limit 1`;
    const legal = await sql<{
      status: string;
      reviewed_at: string | Date;
    }>`select status,reviewed_at from bridge_legal_cases where title_id=${data.titleId} order by created_at desc limit 1`;
    const gate = await sql<{
      ott_preparation_status: string;
      packaging_status: string;
      curation_status: string;
      delivery_status: string;
      updated_at: string | Date;
    }>`select ott_preparation_status,packaging_status,curation_status,delivery_status,updated_at
      from bridge_title_gate_certifications where title_id=${data.titleId} limit 1`;
    return {
      grants: grants.map((g) => ({
        ...g,
        window_start: g.window_start ? new Date(g.window_start).toISOString() : "",
        window_end: g.window_end ? new Date(g.window_end).toISOString() : "",
        created_at: new Date(g.created_at).toISOString(),
      })),
      qc: qc[0] ? { ...qc[0], reviewed_at: new Date(qc[0].reviewed_at).toISOString() } : null,
      legal: legal[0]
        ? { ...legal[0], reviewed_at: new Date(legal[0].reviewed_at).toISOString() }
        : null,
      gateCertification: gate[0]
        ? { ...gate[0], updated_at: new Date(gate[0].updated_at).toISOString() }
        : null,
    };
  });

// Read canonical, deduplicated captured events; never infer revenue from orders or current title price.
export const getTitleRevenue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canOperateOnTitle(actor, title, "title.read_own", "finance.read"))
      throw new Error("Forbidden");
    const sql = await getSql();
    const bridgeRows = await sql<{
      payment_id: string;
      order_id: string;
      purchased_at: string | Date;
      amount_paise: number;
      currency: string;
      provider_fee_paise: number | null;
      provider_tax_paise: number | null;
      refunded_amount_paise: number | null;
      chargeback_amount_paise: number | null;
    }>`
      select provider_payment_id as payment_id, provider_order_id as order_id, created_at as purchased_at,
        amount_paise, currency, provider_fee_paise, provider_tax_paise, refunded_amount_paise, chargeback_amount_paise
      from bridge_payments
      where title_id = ${data.titleId} and purpose = 'title_license' and provider = 'razorpay'
        and status = 'captured' and provider_payment_id is not null and provider_order_id is not null
      order by created_at desc limit 100
    `;
    const keyId = bridgeEnv.razorpayKeyId(), keySecret = bridgeEnv.razorpayKeySecret();
    const bridgeReceipts = keyId && keySecret ? await Promise.all(bridgeRows.map(async (r) => {
      try {
        const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(r.payment_id)}`, {
          headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return null;
        const payment = await response.json() as {
          id?: string; order_id?: string; status?: string; captured?: boolean;
          amount?: number; currency?: string; amount_refunded?: number; fee?: number | null; tax?: number | null;
        };
        if (payment.id !== r.payment_id || payment.order_id !== r.order_id || payment.status !== "captured" ||
            payment.captured !== true || payment.currency !== "INR" || payment.currency !== r.currency ||
            !Number.isSafeInteger(payment.amount) || payment.amount !== r.amount_paise) return null;
        const fee = Number.isSafeInteger(payment.fee) && Number(payment.fee) >= 0 ? Number(payment.fee) : r.provider_fee_paise;
        const tax = Number.isSafeInteger(payment.tax) && Number(payment.tax) >= 0 ? Number(payment.tax) : r.provider_tax_paise;
        const refunded = Number.isSafeInteger(payment.amount_refunded) && Number(payment.amount_refunded) >= 0
          ? Number(payment.amount_refunded) : r.refunded_amount_paise;
        const validRefund = refunded !== null && refunded <= r.amount_paise ? refunded : null;
        const validFee = fee !== null && fee !== undefined && Number.isSafeInteger(Number(fee)) && Number(fee) >= 0 ? Number(fee) : null;
        const validTax = tax !== null && tax !== undefined && Number.isSafeInteger(Number(tax)) && Number(tax) >= 0 ? Number(tax) : null;
        return {
          paymentId: r.payment_id, orderId: r.order_id, purchasedAt: new Date(r.purchased_at).toISOString(),
          amountPaise: r.amount_paise, currency: r.currency, providerFeePaise: validFee,
          providerTaxPaise: validTax, refundedAmountPaise: validRefund,
          chargebackAmountPaise: r.chargeback_amount_paise !== null && Number.isSafeInteger(r.chargeback_amount_paise) && r.chargeback_amount_paise >= 0 ? r.chargeback_amount_paise : null,
          source: "bridge_payment" as const,
          providerVerified: true as const,
        };
      } catch { return null; }
    })) : [];
    const rows = await sql<{
      payment_id: string;
      purchased_at: string | Date;
      amount_text: string | null;
      currency: string | null;
      order_id: string | null;
    }>`
      select distinct on(e.razorpay_payment_id) e.razorpay_payment_id as payment_id,coalesce((e.payload->>'purchased_at')::timestamptz,t.purchased_at,e.processed_at,e.received_at) as purchased_at,
        coalesce(e.payload->>'amount',e.payload#>>'{payment,amount}',e.payload#>>'{payload,payment,entity,amount}') as amount_text,
        coalesce(e.payload->>'currency',e.payload#>>'{payment,currency}',e.payload#>>'{payload,payment,entity,currency}') as currency,
        coalesce(e.payload->>'order_id',e.payload->>'razorpay_order_id',e.payload#>>'{payload,payment,entity,order_id}') as order_id
      from loop_payment_events e left join loop_user_tvod_entitlements t on t.payment_transaction_id=e.razorpay_payment_id
      join loop_titles l on l.id::text=coalesce(e.payload->>'title_id',t.title_id::text)
      where l.bridge_title_id=${data.titleId} and e.status in ('captured','processed') and e.razorpay_payment_id is not null
      order by e.razorpay_payment_id,e.received_at desc limit 200`;
    const loopReceipts = rows.map((r) => ({
      paymentId: r.payment_id,
      orderId: r.order_id,
      purchasedAt: new Date(r.purchased_at).toISOString(),
      amountPaise:
        r.currency === "INR" &&
        /^\\d+$/.test(r.amount_text ?? "") &&
        Number.isSafeInteger(Number(r.amount_text))
          ? Number(r.amount_text)
          : null,
      currency: r.currency,
      providerFeePaise: null as number | null,
      providerTaxPaise: null as number | null,
      refundedAmountPaise: null as number | null,
      chargebackAmountPaise: null as number | null,
      source: "loop_tvod" as const,
      providerVerified: false,
    }));
    const bridgePaymentIds = new Set(bridgeReceipts.map((r) => r?.paymentId).filter(Boolean));
    const receipts = [
      ...bridgeReceipts.filter((r): r is NonNullable<typeof r> => Boolean(r)),
      ...loopReceipts.filter((r) => !bridgePaymentIds.has(r.paymentId)),
    ];
    const settlementEvidence = await sql<{
      id: number;
      metadata: string;
      created_at: string | Date;
    }>`
      select id,metadata,created_at from bridge_audit_logs where entity_type='bridge_title'
        and entity_id=${data.titleId} and action='finance.settlement_evidence' order by created_at desc limit 100`;
    // Bounded provider reads fill gaps in the historical fulfillment ledger.
    // Credentials remain server-side; no order, capture or transfer is created.
    const key = bridgeEnv.razorpayKeyId(),
      secret = bridgeEnv.razorpayKeySecret();
    if (key && secret) {
      for (let i = 0; i < Math.min(receipts.length, 12); i += 3)
        await Promise.all(
          receipts.slice(i, i + 3).map(async (receipt) => {
            if (receipt.amountPaise !== null) return;
            try {
              const response = await fetch(
                `https://api.razorpay.com/v1/payments/${encodeURIComponent(receipt.paymentId)}`,
                {
                  headers: {
                    Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
                  },
                  signal: AbortSignal.timeout(5000),
                },
              );
              if (!response.ok) return;
              const payment = (await response.json()) as {
                id?: string;
                status?: string;
                currency?: string;
                amount?: number;
                amount_refunded?: number;
                order_id?: string;
              };
              if (
                payment.id === receipt.paymentId &&
                receipt.orderId &&
                payment.order_id === receipt.orderId &&
                payment.status === "captured" &&
                payment.currency === "INR" &&
                Number.isSafeInteger(payment.amount) &&
                Number(payment.amount) > 0 &&
                Number(payment.amount_refunded ?? 0) === 0
              ) {
                receipt.amountPaise = Number(payment.amount);
                receipt.currency = "INR";
              }
            } catch {
              /* Missing provider evidence remains visible; never invent an amount. */
            }
          }),
        );
    }
    const approvedLicenses = await sql<{
      window_start: string | Date | null;
      window_end: string | Date | null;
      reviewed_at: string | Date;
      evidence: Array<{ commercialTerms?: { rightsOwnerSharePct: number } }>;
    }>`
      select g.window_start,g.window_end,l.reviewed_at,g.evidence from bridge_rights_grants g
        join bridge_legal_cases l on l.evidence->0->>'grantId'=g.id::text
      where g.title_id=${data.titleId} and l.status='APPROVED'`;
    return {
      receipts: receipts.map((receipt) => {
        const at = new Date(receipt.purchasedAt).getTime();
        const candidates = approvedLicenses.filter(
          (g) =>
            g.window_start &&
            g.window_end &&
            new Date(g.window_start).getTime() <= at &&
            new Date(g.window_end).getTime() > at &&
            new Date(g.reviewed_at).getTime() <= at,
        );
        const share =
          candidates.length === 1
            ? candidates[0].evidence?.[0]?.commercialTerms?.rightsOwnerSharePct
            : null;
        return {
          ...receipt,
          netAfterProviderCostsPaise:
            receipt.providerFeePaise !== null && receipt.providerTaxPaise !== null && receipt.refundedAmountPaise !== null && receipt.chargebackAmountPaise !== null && receipt.amountPaise !== null
              ? Math.max(0, receipt.amountPaise - receipt.providerFeePaise - receipt.providerTaxPaise - receipt.refundedAmountPaise - receipt.chargebackAmountPaise)
              : null,
          reconciliationStatus:
            receipt.providerVerified && receipt.providerFeePaise !== null && receipt.providerTaxPaise !== null && receipt.refundedAmountPaise !== null && receipt.chargebackAmountPaise !== null
              ? "PROVIDER_DATA_AVAILABLE_RECONCILIATION_PENDING" as const
              : "RECONCILIATION_REQUIRED" as const,
          grossProducerSharePaise:
            receipt.amountPaise !== null &&
            typeof share === "number" &&
            Number.isInteger(share) &&
            share >= 0 &&
            share <= 100
              ? producerSharePaise(receipt.amountPaise, share)
              : null,
        };
      }),
      settlementEvidence: settlementEvidence.map((r) => ({
        id: Number(r.id),
        details: z
          .object({
            reference: z.string(),
            invoiceReference: z.string(),
            statementReference: z.string(),
            amountPaise: z.number(),
            currency: z.literal("INR"),
            status: z.literal("EXTERNAL_EVIDENCE_UNVERIFIED"),
          })
          .parse(JSON.parse(r.metadata)),
        recordedAt: new Date(r.created_at).toISOString(),
      })),
      statementStatus: "RECONCILIATION_REQUIRED" as const,
    };
  });

// Records externally executed settlement documents. It never initiates a payout
// or labels the external transfer as provider-verified.
export const recordSettlementEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      reference: z.string().trim().min(8).max(160),
      invoiceReference: z.string().trim().min(8).max(500),
      statementReference: z.string().trim().min(8).max(500),
      amountPaise: z.number().int().positive().max(2_000_000_000),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.record_settlement");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    return (await getSql()).transaction(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`settlement:${data.reference}`},0))`;
      const prior =
        await tx`select id from bridge_audit_logs where action='finance.settlement_evidence'
        and metadata::jsonb->>'reference'=${data.reference} limit 1`;
      if (prior.length) throw new Error("This settlement reference is already recorded");
      await audit(tx, actor.userId, data.titleId, "finance.settlement_evidence", {
        reference: data.reference,
        invoiceReference: data.invoiceReference,
        statementReference: data.statementReference,
        amountPaise: data.amountPaise,
        currency: "INR",
        status: "EXTERNAL_EVIDENCE_UNVERIFIED",
      });
      return { status: "EXTERNAL_EVIDENCE_UNVERIFIED" as const };
    });
  });
