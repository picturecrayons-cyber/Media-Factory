import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { writeAudit } from "./audit";
import { assertPermission, canOperateOnTitle, type Actor } from "./rbac";
import { requireVerifiedActor } from "./session";

const jobTypes = ["dubbing", "loudness", "imf", "dcp", "human_qc"] as const;
const jobStatuses = ["requested", "in_progress", "completed", "failed", "approved"] as const;
const interestLevels = ["VIEWED", "INTERESTED", "REQUESTED_MATERIALS", "PASSED", "LICENSED"] as const;
const buyerEditableLevels = ["VIEWED", "INTERESTED", "REQUESTED_MATERIALS", "PASSED"] as const;

const createJobInput = z.object({
  titleId: z.string().trim().min(1).max(200),
  jobType: z.enum(jobTypes),
  assignedVendor: z.string().trim().max(200).nullable().optional(),
});
const listJobsInput = z.object({ titleId: z.string().trim().min(1).max(200) });
const updateJobInput = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["requested", "in_progress", "completed", "failed"]).optional(),
  assignedVendor: z.string().trim().max(200).nullable().optional(),
  deliveryReceiptUrl: z.string().url().max(2048).nullable().optional(),
}).refine((v) => v.status !== undefined || v.assignedVendor !== undefined || v.deliveryReceiptUrl !== undefined, {
  message: "At least one field must be updated",
});
const signOffInput = z.object({ jobId: z.string().uuid() });

type TitleAccessRow = {
  id: string;
  owner_user_id: string;
  owner_account_type: string;
  owner_organization_id: string | null;
  status: string;
};
type JobRow = {
  id: string;
  title_id: string;
  job_type: (typeof jobTypes)[number];
  status: (typeof jobStatuses)[number];
  assigned_vendor: string | null;
  delivery_receipt_url: string | null;
  admin_sign_off: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

async function loadTitleAccess(tx: Sql, titleId: string): Promise<TitleAccessRow> {
  const rows = await tx<TitleAccessRow>`
    select t.id, t.owner_user_id, t.owner_account_type, t.owner_organization_id, t.status
    from public.bridge_titles t where t.id = ${titleId} limit 1
  `;
  if (!rows[0]) throw new Error("Title not found");
  return rows[0];
}

function canReadJobsForTitle(actor: Actor, title: TitleAccessRow): boolean {
  return canOperateOnTitle(actor, {
    ownerUserId: title.owner_user_id,
    ownerAccountType: title.owner_account_type as Actor["accountType"],
    ownerOrganizationId: title.owner_organization_id,
  }, "title.read_own", "delivery.read");
}

function assertDeliveryOperator(actor: Actor): void {
  // Existing Bridge permissions intentionally limit vendor-job mutations to
  // internal roles that have the delivery permission; no client metadata is trusted.
  assertPermission(actor, "title.deliver");
}

async function requireJob(tx: Sql, jobId: string): Promise<JobRow> {
  const rows = await tx<JobRow>`
    select id, title_id, job_type, status, assigned_vendor, delivery_receipt_url,
           admin_sign_off, created_at, updated_at
    from public.bridge_delivery_jobs where id = ${jobId} for update
  `;
  if (!rows[0]) throw new Error("Delivery job not found");
  return rows[0];
}

export const createDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createJobInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertDeliveryOperator(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const title = await loadTitleAccess(tx, data.titleId);
      const [job] = await tx<JobRow>`
        insert into public.bridge_delivery_jobs (title_id, job_type, status, assigned_vendor)
        values (
          ${data.titleId}, ${data.jobType}, 'requested',
          ${data.assignedVendor?.trim() || null}
        )
        returning id, title_id, job_type, status, assigned_vendor, delivery_receipt_url,
                  admin_sign_off, created_at, updated_at
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "delivery_job.create",
        entityType: "bridge_delivery_job",
        entityId: job.id,
        metadata: { titleId: title.id, jobType: job.job_type, status: job.status },
      }, tx);
      return job;
    });
  });

export const listDeliveryJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listJobsInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const title = await loadTitleAccess(sql, data.titleId);
    if (!canReadJobsForTitle(actor, title)) throw new Error("Forbidden");
    return sql<JobRow>`
      select id, title_id, job_type, status, assigned_vendor, delivery_receipt_url,
             admin_sign_off, created_at, updated_at
      from public.bridge_delivery_jobs
      where title_id = ${data.titleId}
      order by created_at desc
      limit 200
    `;
  });

export const updateDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateJobInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertDeliveryOperator(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const current = await requireJob(tx, data.jobId);
      if (current.admin_sign_off || current.status === "approved") {
        throw new Error("Signed-off delivery jobs are immutable");
      }
      const allowedNext: Record<string, string[]> = {
        requested: ["in_progress", "failed"],
        in_progress: ["completed", "failed"],
        completed: [],
        failed: [],
      };
      if (data.status && data.status !== current.status && !allowedNext[current.status]?.includes(data.status)) {
        throw new Error("Invalid delivery-job status transition");
      }
      const assignedVendor = data.assignedVendor === undefined
        ? current.assigned_vendor
        : (data.assignedVendor?.trim() || null);
      const receiptUrl = data.deliveryReceiptUrl === undefined
        ? current.delivery_receipt_url
        : data.deliveryReceiptUrl;
      const nextStatus = data.status ?? current.status;
      const [updated] = await tx<JobRow>`
        update public.bridge_delivery_jobs
        set status = ${nextStatus},
            assigned_vendor = ${assignedVendor},
            delivery_receipt_url = ${receiptUrl},
            updated_at = now()
        where id = ${current.id}
        returning id, title_id, job_type, status, assigned_vendor, delivery_receipt_url,
                  admin_sign_off, created_at, updated_at
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "delivery_job.update",
        entityType: "bridge_delivery_job",
        entityId: current.id,
        metadata: {
          before: { status: current.status, assignedVendor: current.assigned_vendor, deliveryReceiptUrl: current.delivery_receipt_url },
          after: { status: updated.status, assignedVendor: updated.assigned_vendor, deliveryReceiptUrl: updated.delivery_receipt_url },
        },
      }, tx);
      return updated;
    });
  });

export const signOffDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(signOffInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertDeliveryOperator(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const current = await requireJob(tx, data.jobId);
      if (current.admin_sign_off || current.status === "approved") {
        throw new Error("Delivery job is already signed off");
      }
      if (current.status !== "completed") throw new Error("Only completed jobs can be signed off");
      if (!current.delivery_receipt_url) throw new Error("A delivery receipt is required before sign-off");
      const [updated] = await tx<JobRow>`
        update public.bridge_delivery_jobs
        set status = 'approved', admin_sign_off = true, updated_at = now()
        where id = ${current.id}
        returning id, title_id, job_type, status, assigned_vendor, delivery_receipt_url,
                  admin_sign_off, created_at, updated_at
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "delivery_job.update",
        entityType: "bridge_delivery_job",
        entityId: current.id,
        metadata: { operation: "admin_sign_off", previousStatus: current.status, status: updated.status },
      }, tx);
      return updated;
    });
  });

const interestTargetInput = z.object({
  titleId: z.string().trim().min(1).max(200).optional(),
  conceptSubmissionId: z.string().uuid().optional(),
}).refine((v) => Boolean(v.titleId) !== Boolean(v.conceptSubmissionId), {
  message: "Provide exactly one of titleId or conceptSubmissionId",
});
const createInterestInput = interestTargetInput;
const updateInterestInput = z.object({
  interestId: z.string().uuid(),
  interestLevel: z.enum(interestLevels).optional(),
  commercialModel: z.enum([
    "FIXED_FEE", "REVENUE_SHARE", "MINIMUM_GUARANTEE",
    "MG_PLUS_REVENUE_SHARE", "TVOD_SPLIT", "AVOD_SPLIT",
  ]).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  licenseFeeMinor: z.number().int().nonnegative().nullable().optional(),
  revenueSharePercent: z.number().min(0).max(100).nullable().optional(),
  termsStatus: z.enum(["not_proposed", "proposed", "under_negotiation", "agreed", "contracted"]).optional(),
  contractReference: z.string().trim().min(3).max(500).nullable().optional(),
}).refine((v) => Object.keys(v).some((k) => k !== "interestId"), {
  message: "At least one field must be updated",
});

type InterestRow = {
  id: string;
  title_id: string | null;
  concept_submission_id: string | null;
  buyer_user_id: string;
  interest_level: (typeof interestLevels)[number];
  commercial_model: string | null;
  currency: string;
  license_fee_minor: string | number | null;
  revenue_share_percent: string | number | null;
  terms_status: string;
  contract_reference: string | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export const createBuyerInterest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInterestInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "buyer") {
      throw new Error("Only a verified buyer account can register its own interest");
    }
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      let titleId: string | null = null;
      let conceptId: string | null = null;
      if (data.titleId) {
        const title = await loadTitleAccess(tx, data.titleId);
        if (!["LIVE_FOR_BUYERS", "IN_NEGOTIATION"].includes(title.status)) {
          throw new Error("Buyer interest is available only for cleared titles published to the buyer catalog");
        }
        titleId = data.titleId;
      } else {
        conceptId = data.conceptSubmissionId!;
        const rows = await tx<{ id: string }>`
          select s.id from public.bridge_story_concept_submissions s
          join public.bridge_titles t on t.id = s.title_id
          where s.id = ${conceptId}
            and s.curation_status = 'INTRODUCED_TO_BUYERS'
            and t.submission_type = 'story_concept'
          limit 1
        `;
        if (!rows[0]) throw new Error("Concept has not been introduced to verified buyers");
      }

      const existing = await tx<InterestRow>`
        select id, title_id, concept_submission_id, buyer_user_id, interest_level,
               commercial_model, currency, license_fee_minor, revenue_share_percent,
               terms_status, contract_reference, notes, created_at, updated_at
        from public.bridge_buyer_interest
        where buyer_user_id = ${actor.userId}
          and ((${titleId}::text is not null and title_id = ${titleId})
            or (${conceptId}::uuid is not null and concept_submission_id = ${conceptId}::uuid))
        order by created_at desc limit 1 for update
      `;
      let row: InterestRow;
      if (existing[0]) {
        [row] = await tx<InterestRow>`
          update public.bridge_buyer_interest
          set interest_level = 'INTERESTED', updated_at = now(), updated_by = ${actor.userId}
          where id = ${existing[0].id}
          returning id, title_id, concept_submission_id, buyer_user_id, interest_level,
                    commercial_model, currency, license_fee_minor, revenue_share_percent,
                    terms_status, contract_reference, notes, created_at, updated_at
        `;
      } else {
        [row] = await tx<InterestRow>`
          insert into public.bridge_buyer_interest
            (title_id, concept_submission_id, buyer_user_id, interest_level, updated_by)
          values (${titleId}, ${conceptId}, ${actor.userId}, 'INTERESTED', ${actor.userId})
          returning id, title_id, concept_submission_id, buyer_user_id, interest_level,
                    commercial_model, currency, license_fee_minor, revenue_share_percent,
                    terms_status, contract_reference, notes, created_at, updated_at
        `;
      }
      await writeAudit({
        actorUserId: actor.userId,
        action: "buyer_interest.create",
        entityType: "bridge_buyer_interest",
        entityId: row.id,
        metadata: { titleId, conceptSubmissionId: conceptId, interestLevel: row.interest_level },
      }, tx);
      return row;
    });
  });

export const listBuyerInterest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    if (actor.internalRole) {
      assertPermission(actor, "title.negotiate");
      return sql<InterestRow>`
        select id, title_id, concept_submission_id, buyer_user_id, interest_level,
               commercial_model, currency, license_fee_minor, revenue_share_percent,
               terms_status, contract_reference, notes, created_at, updated_at
        from public.bridge_buyer_interest
        order by updated_at desc limit 500
      `;
    }
    if (actor.accountType !== "buyer") throw new Error("Forbidden");
    return sql<InterestRow>`
      select id, title_id, concept_submission_id, buyer_user_id, interest_level,
             commercial_model, currency, license_fee_minor, revenue_share_percent,
             terms_status, contract_reference, notes, created_at, updated_at
      from public.bridge_buyer_interest
      where buyer_user_id = ${actor.userId}
      order by updated_at desc limit 200
    `;
  });

export const updateBuyerInterest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateInterestInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const internal = Boolean(actor.internalRole);
    if (internal) assertPermission(actor, "title.negotiate");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const rows = await tx<InterestRow>`
        select id, title_id, concept_submission_id, buyer_user_id, interest_level,
               commercial_model, currency, license_fee_minor, revenue_share_percent,
               terms_status, contract_reference, notes, created_at, updated_at
        from public.bridge_buyer_interest where id = ${data.interestId} for update
      `;
      const current = rows[0];
      if (!current) throw new Error("Buyer interest not found");
      if (!internal && (actor.accountType !== "buyer" || current.buyer_user_id !== actor.userId)) {
        throw new Error("Forbidden");
      }
      if (!internal && data.interestLevel && !(buyerEditableLevels as readonly string[]).includes(data.interestLevel)) {
        throw new Error("Buyer cannot set LICENSED; licensing requires a separate authorized workflow");
      }
      if (!internal && Object.keys(data).some((k) => !["interestId", "interestLevel"].includes(k))) {
        throw new Error("Buyers may update only their own interest level");
      }
      const nextLevel = data.interestLevel ?? current.interest_level;
      const nextTermsStatus = data.termsStatus ?? current.terms_status;
      const nextContractRef = data.contractReference === undefined ? current.contract_reference : data.contractReference;
      if (nextLevel === "LICENSED" && (!internal || nextTermsStatus !== "contracted" || !nextContractRef)) {
        throw new Error("LICENSED requires an authorized internal operator, contracted terms, and a contract reference");
      }
      const [updated] = await tx<InterestRow>`
        update public.bridge_buyer_interest
        set interest_level = ${nextLevel},
            commercial_model = ${data.commercialModel === undefined ? current.commercial_model : data.commercialModel},
            currency = ${data.currency ?? current.currency},
            license_fee_minor = ${data.licenseFeeMinor === undefined ? current.license_fee_minor : data.licenseFeeMinor},
            revenue_share_percent = ${data.revenueSharePercent === undefined ? current.revenue_share_percent : data.revenueSharePercent},
            terms_status = ${nextTermsStatus},
            contract_reference = ${nextContractRef},
            updated_by = ${actor.userId},
            updated_at = now()
        where id = ${current.id}
        returning id, title_id, concept_submission_id, buyer_user_id, interest_level,
                  commercial_model, currency, license_fee_minor, revenue_share_percent,
                  terms_status, contract_reference, notes, created_at, updated_at
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "buyer_interest.update",
        entityType: "bridge_buyer_interest",
        entityId: current.id,
        metadata: {
          before: { interestLevel: current.interest_level, termsStatus: current.terms_status },
          after: { interestLevel: updated.interest_level, termsStatus: updated.terms_status },
        },
      }, tx);
      return updated;
    });
  });
