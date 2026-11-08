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

  const normalizedAgreementReference = data.agreementReference.trim().toUpperCase();
  await tx`select pg_advisory_xact_lock(hashtextextended(${`bridge-license-agreement:${normalizedAgreementReference}`},0))`;
  const priorRows = await tx<{
    id: string;
    title_id: string;
    status: string;
    territories: string[];
    languages: string[];
    window_start: string | Date;
    window_end: string | Date;
    exclusivity: string;
    evidence: Array<{
      agreementReference?: string;
      ownershipReference?: string;
      commercialTerms?: { rightsOwnerSharePct: number; distributorSharePct: number };
    }>;
  }>`select id,title_id,status,territories,languages,window_start,window_end,exclusivity,evidence
    from bridge_rights_grants
    where exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(evidence)='array' then evidence else '[]'::jsonb end) as evidence_item(value)
      where upper(trim(evidence_item.value->>'agreementReference'))=${normalizedAgreementReference}
    )
    order by created_at asc
    for update`;
  if (priorRows.length > 1)
    throw new Error("Multiple records already use this agreement reference; legacy reconciliation is required before retrying");
  const prior = priorRows[0];
  if (prior && prior.title_id !== data.titleId)
    throw new Error("Agreement reference is already assigned to another title");

  const commercialTerms = {
    rightsOwnerSharePct: data.rightsOwnerSharePct,
    distributorSharePct: data.distributorSharePct,
  };
  if (prior) {
    const priorEvidence = prior.evidence?.[0];
    const sameSet = (left: string[], right: string[]) =>
      [...left].map((value) => value.trim().toUpperCase()).sort().join("|") ===
      [...right].map((value) => value.trim().toUpperCase()).sort().join("|");
    const sameDraft =
      sameSet(prior.territories ?? [], data.territories) &&
      sameSet(prior.languages ?? [], data.languages) &&
      new Date(prior.window_start).getTime() === new Date(data.windowStart).getTime() &&
      new Date(prior.window_end).getTime() === new Date(data.windowEnd).getTime() &&
      prior.exclusivity === data.exclusivity &&
      priorEvidence?.ownershipReference === data.ownershipReference &&
      priorEvidence?.commercialTerms?.rightsOwnerSharePct === commercialTerms.rightsOwnerSharePct &&
      priorEvidence?.commercialTerms?.distributorSharePct === commercialTerms.distributorSharePct;
    if (!sameDraft) throw new Error("Agreement reference already exists with different licensing terms");
    if (prior.status !== "DRAFT")
      throw new Error("This agreement reference already has a non-draft rights decision");
    return { grantId: prior.id };
  }

  const existingGrants = await tx<{
    id: string;
    status: string;
    territories: string[];
    languages: string[];
    media: string[];
    window_start: string | Date;
    window_end: string | Date;
    exclusivity: string;
  }>`select id,status,territories,languages,media,window_start,window_end,exclusivity
    from bridge_rights_grants
    where title_id=${data.titleId} and status in ('DRAFT','VALID')
    for update`;
  const requestedStart = new Date(data.windowStart).getTime();
  const requestedEnd = new Date(data.windowEnd).getTime();
  const normalized = (values: string[]) => (values ?? []).map((value) => value.trim().toUpperCase());
  const overlaps = existingGrants.some((existing) => {
    const existingTerritories = normalized(existing.territories);
    const requestedTerritories = normalized(data.territories);
    const territoryOverlap =
      existingTerritories.includes("WORLDWIDE") ||
      requestedTerritories.includes("WORLDWIDE") ||
      existingTerritories.some((value) => requestedTerritories.includes(value));
    const languageOverlap = normalized(existing.languages).some((value) =>
      normalized(data.languages).includes(value),
    );
    const mediaOverlap = normalized(existing.media).some((value) =>
      ["CRAYONS_LOOP", "TVOD"].includes(value),
    );
    const timeOverlap =
      new Date(existing.window_start).getTime() < requestedEnd &&
      requestedStart < new Date(existing.window_end).getTime();
    return (
      territoryOverlap &&
      languageOverlap &&
      mediaOverlap &&
      timeOverlap &&
      (existing.exclusivity === "EXCLUSIVE" || data.exclusivity === "EXCLUSIVE")
    );
  });
  if (overlaps)
    throw new Error("Conflicting exclusive or non-exclusive rights grant overlaps this title, territory, language and window");

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
  if (data.stage === "LEGAL" && actor.internalRole !== "legal_reviewer")
    throw new Error("Only an authorized Legal reviewer may approve or reject rights grants");
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
      kind: string;
      s3_key: string;
    }>`select kind,s3_key from bridge_assets where title_id=${data.titleId} and byte_size>0`;
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
    if (grant.created_by === actor.userId)
      throw new Error("Another legal reviewer must approve this license");
    if (data.decision === "APPROVE" && new Date(grant.window_end) <= new Date())
      throw new Error("License has expired");
    if (data.decision === "APPROVE") {
      const verifiedEvidence = await tx<{
        id: string;
        evidence_type: string;
        asset_version_id: string;
        checksum_sha256: string;
        submitted_by: string;
        reviewed_by: string;
        related_agreement_evidence_id: string | null;
      }>`select e.id,e.evidence_type,e.asset_version_id,e.checksum_sha256,e.submitted_by,e.reviewed_by,e.related_agreement_evidence_id
        from bridge_rights_evidence e
        join bridge_asset_versions av on av.id=e.asset_version_id and av.title_id=e.title_id
          and av.asset_group='DOCUMENT' and av.asset_type='RIGHTS_EVIDENCE'
        join bridge_assets a on a.asset_version_id=av.id and a.kind='rights_document'
          and a.verified_object_key=av.s3_key and a.storage_verified_at is not null
          and lower(a.checksum_sha256)=lower(e.checksum_sha256)
        join bridge_rights_evidence_reviews er
          on er.evidence_id=e.id
          and er.decision='VERIFIED'
          and er.reviewer_user_id=e.reviewed_by
          and lower(er.evidence_checksum_sha256)=lower(e.checksum_sha256)
        where e.rights_grant_id=${data.grantId}
          and e.title_id=${data.titleId}
          and e.status='VERIFIED'
          and e.reviewed_by is not null
          and e.reviewed_by <> ${grant.created_by}
          and e.reviewed_by <> e.submitted_by
          and av.asset_group='DOCUMENT'
          and av.processing_state='PASSED'
          and lower(av.checksum_sha256)=lower(e.checksum_sha256)
        for update of e,av,a`;
      const verifiedTypes = new Set(verifiedEvidence.map((item) => item.evidence_type));
      const mandatoryTypes = ["EXECUTED_AGREEMENT", "OWNERSHIP_CHAIN", "SIGNATORY_AUTHORITY", "DISTRIBUTION_AUTHORITY"];
      if (!mandatoryTypes.every((type) => verifiedTypes.has(type)))
        throw new Error("Legal approval requires independently verified executed agreement, ownership chain, signatory authority, and Master Distributor / sublicensing authority evidence");
      const executedAgreementIds = new Set(verifiedEvidence.filter((item) => item.evidence_type === "EXECUTED_AGREEMENT").map((item) => item.id));
      const supplements = verifiedEvidence.filter((item) => ["SIGNED_AMENDMENT", "SIGNED_ADDENDUM", "RIGHTS_SCHEDULE"].includes(item.evidence_type));
      if (supplements.some((item) => !item.related_agreement_evidence_id || !executedAgreementIds.has(item.related_agreement_evidence_id)))
        throw new Error("Every signed amendment, addendum and rights schedule must be independently verified and linked to its executed agreement");
      await tx`insert into bridge_legal_cases(title_id,status,evidence,reviewed_by,reviewed_at)
        values (${data.titleId},'APPROVED',
        ${JSON.stringify([{
          grantId: data.grantId,
          note: data.note,
          verifiedEvidence: verifiedEvidence.map((item) => ({
            evidenceId: item.id,
            evidenceType: item.evidence_type,
            assetVersionId: item.asset_version_id,
            checksumSha256: item.checksum_sha256,
            submittedBy: item.submitted_by,
            reviewedBy: item.reviewed_by,
            relatedAgreementEvidenceId: item.related_agreement_evidence_id,
          })),
        }])}::jsonb,${actor.userId},now())`;
      await tx`update bridge_rights_grants set status='VALID' where id=${data.grantId}`;
    } else {
      await tx`insert into bridge_legal_cases(title_id,status,evidence,reviewed_by,reviewed_at)
        values (${data.titleId},'REJECTED',
        ${JSON.stringify([{ grantId: data.grantId, note: data.note }])}::jsonb,${actor.userId},now())`;
      await tx`update bridge_rights_grants set status='REVOKED' where id=${data.grantId}`;
    }
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
      media: string[];
      window_start: string | Date;
      window_end: string | Date;
      exclusivity: string;
      evidence: Array<{
        agreementReference?: string;
        ownershipReference?: string;
        commercialTerms?: { rightsOwnerSharePct: number; distributorSharePct: number };
      }>;
    }>`select id,status,territories,languages,media,window_start,window_end,exclusivity,evidence from bridge_rights_grants where title_id=${data.titleId} order by created_at desc`;
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
    const documentAssets = await sql<{
      id: string;
      asset_type: string;
      version: number;
      s3_key: string;
      checksum_sha256: string;
    }>`select id,asset_type,version,s3_key,checksum_sha256
      from bridge_asset_versions
      where title_id=${data.titleId} and asset_group='DOCUMENT'
        and processing_state='PASSED' and checksum_sha256 is not null
      order by created_at desc limit 100`;
    const rightsEvidence = await sql<{
      id: string;
      rights_grant_id: string;
      evidence_type: string;
      asset_version_id: string;
      status: string;
      submitted_by: string;
      reviewed_by: string | null;
      created_at: string | Date;
    }>`select id,rights_grant_id,evidence_type,asset_version_id,status,submitted_by,reviewed_by,created_at
      from bridge_rights_evidence where title_id=${data.titleId} order by created_at desc limit 100`;
    return {
      documentAssets,
      rightsEvidence: rightsEvidence.map((item) => ({
        ...item,
        created_at: new Date(item.created_at).toISOString(),
      })),
      grants: grants.map((g) => ({
        ...g,
        window_start: g.window_start ? new Date(g.window_start).toISOString() : "",
        window_end: g.window_end ? new Date(g.window_end).toISOString() : "",
      })),
      qc: qc[0] ? { ...qc[0], reviewed_at: new Date(qc[0].reviewed_at).toISOString() } : null,
      legal: legal[0]
        ? { ...legal[0], reviewed_at: new Date(legal[0].reviewed_at).toISOString() }
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
    const receipts = rows.map((r) => ({
      paymentId: r.payment_id,
      orderId: r.order_id,
      purchasedAt: new Date(r.purchased_at).toISOString(),
      amountPaise:
        r.currency === "INR" &&
        /^\d+$/.test(r.amount_text ?? "") &&
        Number.isSafeInteger(Number(r.amount_text))
          ? Number(r.amount_text)
          : null,
      currency: r.currency,
    }));
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

export type SettlementEvidenceInput = {
  titleId: string;
  reference: string;
  invoiceReference: string;
  statementReference: string;
  amountPaise: number;
};

export async function recordSettlementEvidenceTx(
  tx: Sql,
  actor: Actor,
  data: SettlementEvidenceInput,
) {
  assertPermission(actor, "finance.record_settlement");
  const reference = data.reference.trim();
  const normalizedReference = reference.toUpperCase();
  if (/^(NOT\s+(EXCECUTED|EXECUTED)|TBD|PENDING|UNEXECUTED)(\s|$)/.test(normalizedReference))
    throw new Error("A placeholder is not a settlement reference; enter the external bank/provider reference");
  const [claim] = await tx<{ id: string }>`insert into bridge_settlement_reference_claims
    (reference_normalized,reference,title_id,invoice_reference,statement_reference,amount_paise,currency,created_by)
    values (${normalizedReference},${reference},${data.titleId},${data.invoiceReference},${data.statementReference},${data.amountPaise},'INR',${actor.userId})
    on conflict (reference_normalized) do nothing
    returning id`;
  if (!claim) {
    const [existing] = await tx<{
      title_id: string;
      invoice_reference: string;
      statement_reference: string;
      amount_paise: number | string;
      currency: string;
      claim_state: string;
    }>`select title_id,invoice_reference,statement_reference,amount_paise,currency,claim_state
      from bridge_settlement_reference_claims where reference_normalized=${normalizedReference}`;
    if (existing?.claim_state === "REVIEW_REQUIRED")
      throw new Error("This legacy settlement reference requires manual reconciliation; do not reuse it");
    if (
      existing &&
      existing.claim_state === "ACTIVE" &&
      existing.title_id === data.titleId &&
      existing.invoice_reference === data.invoiceReference &&
      existing.statement_reference === data.statementReference &&
      Number(existing.amount_paise) === data.amountPaise &&
      existing.currency === "INR"
    ) return { status: "EXTERNAL_EVIDENCE_UNVERIFIED" as const, duplicate: true as const };
    throw new Error("This settlement reference is already recorded with different title or financial terms");
  }
  await audit(tx, actor.userId, data.titleId, "finance.settlement_evidence", {
    reference,
    invoiceReference: data.invoiceReference,
    statementReference: data.statementReference,
    amountPaise: data.amountPaise,
    currency: "INR",
    status: "EXTERNAL_EVIDENCE_UNVERIFIED",
  });
  return { status: "EXTERNAL_EVIDENCE_UNVERIFIED" as const, duplicate: false as const };
}

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
    return (await getSql()).transaction((tx) => recordSettlementEvidenceTx(tx, actor, data));
  });
