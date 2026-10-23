import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

const prospectInput = z.object({
  companyName: z.string().trim().min(2).max(180),
  companyDomain: z.string().trim().max(253).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().max(254).optional(),
  country: z.string().trim().max(80).optional(),
  source: z.enum(["MANUAL", "HOSTINGER_MAIL", "REFERRAL", "EVENT", "WEB"]).default("MANUAL"),
  notesInternal: z.string().max(4000).optional(),
});
const threadInput = z.object({
  prospectId: z.string().uuid(),
  subject: z.string().trim().min(1).max(240),
  channel: z.enum(["HOSTINGER_MAIL", "BRIDGE_INTERNAL", "OTHER"]),
  externalThreadId: z.string().trim().min(1).max(500).optional(),
  mailboxAccountRef: z.string().trim().min(1).max(200).optional(),
});
const draftInput = z.object({
  threadId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  recipients: z.array(z.string().trim().email().max(254)).min(1).max(50),
  subject: z.string().trim().min(1).max(240),
  bodyText: z.string().trim().min(1).max(20000),
});
const threadListInput = z.object({});

async function requireOperator(userId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (!actor.internalRole || !["admin", "super_admin"].includes(actor.internalRole)) {
    throw new Error("Bridge admin access required");
  }
  assertPermission(actor, "title.negotiate");
  return actor;
}

/** Lists prospect metadata for internal operators; does not promote prospects to buyer accounts. */
export const listBuyerProspects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireOperator(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string; company_name: string; company_domain: string | null;
      contact_name: string | null; contact_email: string | null; country: string | null;
      pipeline_stage: string; verification_status: string; updated_at: string | Date;
    }>`
      select id, company_name, company_domain, contact_name, contact_email, country,
             pipeline_stage, verification_status, updated_at
      from bridge_buyer_prospects
      where (${actor.internalRole === "super_admin"} or organization_scope = ${actor.organizationName})
      order by updated_at desc
      limit 500
    `;
    await writeAudit({
      actorUserId: actor.userId, action: "buyer_prospect.list",
      entityType: "bridge_buyer_prospect", metadata: { resultCount: rows.length },
    });
    return { prospects: rows };
  });

/** Creates a deduplicated CRM prospect. It does not create a buyer login or grant rights. */
export const createBuyerProspect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(prospectInput)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    const sql = await getSql();
    const companyName = data.companyName.trim();
    const domain = data.companyDomain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "") || null;
    const email = data.contactEmail?.trim().toLowerCase() || null;
    const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const normalizedDomain = domain ? domain.split("/")[0] : null;
    const normalizedEmail = email;
    const existing = await sql<{ id: string }>`
      select id from bridge_buyer_prospects
      where ( ${normalizedDomain}::text is not null and normalized_domain = ${normalizedDomain} )
         or ( ${normalizedEmail}::text is not null and normalized_contact_email = ${normalizedEmail} )
      limit 1
    `;
    if (existing[0]) throw new Error("Possible duplicate prospect. Open the existing record instead of creating another.");
    const rows = await sql<{ id: string }>`
      insert into bridge_buyer_prospects (
        company_name, normalized_company_name, company_domain, normalized_domain,
        contact_name, contact_email, normalized_contact_email, country, source,
        pipeline_stage, verification_status, owner_user_id, organization_scope, notes_internal
      ) values (
        ${companyName}, ${normalizedName}, ${domain}, ${normalizedDomain},
        ${data.contactName?.trim() || null}, ${email}, ${normalizedEmail}, ${data.country?.trim() || null},
        ${data.source}, 'DISCOVERED', 'UNVERIFIED', ${actor.userId}, ${actor.organizationName},
        ${data.notesInternal ?? null}
      ) returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("Prospect was not created");
    await writeAudit({
      actorUserId: actor.userId, action: "buyer_prospect.create",
      entityType: "bridge_buyer_prospect", entityId: id,
      metadata: { source: data.source, verificationStatus: "UNVERIFIED", pipelineStage: "DISCOVERED" },
    }, sql);
    return { id, pipelineStage: "DISCOVERED", verificationStatus: "UNVERIFIED" };
  });

/** Creates a Bridge-owned link to an external mail thread; never sends mail. */
export const linkBuyerCommunicationThread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(threadInput)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    if (data.channel === "HOSTINGER_MAIL" && !data.externalThreadId) {
      throw new Error("Hostinger Mail thread ID is required to link an email thread.");
    }
    const sql = await getSql();
    const prospect = await sql<{ id: string; organization_scope: string | null }>`
      select id, organization_scope from bridge_buyer_prospects
      where id = ${data.prospectId}
        and (${actor.internalRole === "super_admin"} or organization_scope = ${actor.organizationName})
      limit 1
    `;
    if (!prospect[0]) throw new Error("Buyer prospect not found");
    const scope = prospect[0].organization_scope || `prospect:${prospect[0].id}`;
    const rows = await sql<{ id: string }>`
      insert into bridge_communication_threads (
        prospect_id, organization_scope, subject, channel, external_thread_id,
        mailbox_account_ref, access_scope, created_by
      ) values (
        ${prospect[0].id}, ${scope}, ${data.subject}, ${data.channel},
        ${data.externalThreadId ?? null}, ${data.mailboxAccountRef ?? null}, 'INTERNAL', ${actor.userId}
      ) returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("Communication thread was not linked");
    await writeAudit({
      actorUserId: actor.userId, action: "communication.thread_link",
      entityType: "bridge_communication_thread", entityId: id,
      metadata: { prospectId: prospect[0].id, channel: data.channel, externalThreadId: data.externalThreadId ?? null },
    }, sql);
    return { id, linked: true };
  });

/** Creates an unsent draft. Sending is deliberately not implemented by this endpoint. */
export const prepareBuyerMailDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(draftInput)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    const sql = await getSql();
    const thread = await sql<{ id: string; created_by: string; organization_scope: string }>`
      select id, created_by, organization_scope
      from bridge_communication_threads
      where id = ${data.threadId} and created_by = ${actor.userId}
      limit 1
    `;
    if (!thread[0]) throw new Error("Communication thread is unavailable in your authorized scope.");
    const existing = await sql<{ id: string }>`
      select id from bridge_mail_outbox where idempotency_key = ${data.idempotencyKey} limit 1
    `;
    if (existing[0]) return { id: existing[0].id, status: "DRAFT" as const, duplicate: true };
    const rows = await sql<{ id: string }>`
      insert into bridge_mail_outbox (
        thread_id, idempotency_key, recipient_refs, subject, body_text, status, prepared_by
      ) values (
        ${thread[0].id}, ${data.idempotencyKey}, ${JSON.stringify(data.recipients)}::jsonb,
        ${data.subject}, ${data.bodyText}, 'DRAFT', ${actor.userId}
      ) returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("Mail draft was not saved");
    await writeAudit({
      actorUserId: actor.userId, action: "communication.mail_draft.create",
      entityType: "bridge_mail_outbox", entityId: id,
      metadata: { threadId: thread[0].id, recipientCount: data.recipients.length, status: "DRAFT", sent: false },
    }, sql);
    return { id, status: "DRAFT" as const, duplicate: false, sent: false };
  });

/** Lists only threads created by this operator; cross-operator message contents are not exposed. */
export const listMyBuyerCommunicationThreads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(threadListInput)
  .handler(async ({ context }) => {
    const actor = await requireOperator(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string; subject: string; channel: string; prospect_id: string | null;
      organization_scope: string; last_activity_at: string | Date;
    }>`
      select id, subject, channel, prospect_id, organization_scope, last_activity_at
      from bridge_communication_threads
      where created_by = ${actor.userId}
      order by last_activity_at desc
      limit 200
    `;
    return { threads: rows };
  });


const stageInput = z.object({
  prospectId: z.string().uuid(),
  stage: z.enum(["DISCOVERED", "RESEARCHING", "CONTACT_READY", "ENQUIRY", "IN_NEGOTIATION", "CONTRACT_REVIEW", "CONTRACTED", "DECLINED", "DORMANT"]),
  note: z.string().max(2000).optional(),
});

const verifyInput = z.object({
  prospectId: z.string().uuid(),
  verificationStatus: z.enum(["IDENTITY_REVIEW", "VERIFIED_BUYER", "CONTRACTED_PARTNER", "REJECTED"]),
  legalReference: z.string().trim().min(3).max(300),
});

const ALLOWED_STAGE_TRANSITIONS: Record<string, string[]> = {
  DISCOVERED: ["RESEARCHING", "CONTACT_READY", "DECLINED"],
  RESEARCHING: ["CONTACT_READY", "ENQUIRY", "DECLINED"],
  CONTACT_READY: ["ENQUIRY", "IN_NEGOTIATION", "DECLINED"],
  ENQUIRY: ["IN_NEGOTIATION", "DECLINED", "DORMANT"],
  IN_NEGOTIATION: ["CONTRACT_REVIEW", "DECLINED", "DORMANT"],
  CONTRACT_REVIEW: ["IN_NEGOTIATION", "CONTRACTED", "DECLINED"],
  CONTRACTED: [],
  DECLINED: ["RESEARCHING"],
  DORMANT: ["RESEARCHING"],
};

/** Explicit, audited pipeline transitions; contract status requires prior verification evidence. */
export const advanceBuyerProspectStage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(stageInput)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const currentRows = await tx<{ id: string; pipeline_stage: string; verification_status: string; verification_evidence_ref: string | null }>`
        select id, pipeline_stage, verification_status, verification_evidence_ref
        from bridge_buyer_prospects
        where id = ${data.prospectId}
          and (${actor.internalRole === "super_admin"} or organization_scope = ${actor.organizationName})
        for update
      `;
      const current = currentRows[0];
      if (!current) throw new Error("Buyer prospect not found");
      if (!(ALLOWED_STAGE_TRANSITIONS[current.pipeline_stage] ?? []).includes(data.stage)) {
        throw new Error(`Invalid buyer pipeline transition: ${current.pipeline_stage} → ${data.stage}`);
      }
      if (data.stage === "CONTRACTED" &&
          (current.verification_status !== "CONTRACTED_PARTNER" || !current.verification_evidence_ref)) {
        throw new Error("A contracted partner requires explicit Super Admin verification and a recorded contract/legal reference.");
      }
      await tx`
        update bridge_buyer_prospects set pipeline_stage = ${data.stage}, updated_at = now()
        where id = ${data.prospectId}
      `;
      await writeAudit({
        actorUserId: actor.userId, action: "buyer_prospect.stage_change",
        entityType: "bridge_buyer_prospect", entityId: data.prospectId,
        metadata: { from: current.pipeline_stage, to: data.stage, note: data.note ?? null },
      }, tx);
      await tx`
        insert into bridge_notifications (recipient_user_id, organization_scope, event_type, entity_type, entity_id, dedupe_key, payload)
        values (${actor.userId}, ${actor.organizationName}, 'BUYER_PIPELINE_STAGE_CHANGED',
          'bridge_buyer_prospect', ${data.prospectId},
          ${`buyer-stage:${data.prospectId}:${current.pipeline_stage}:${data.stage}`},
          ${JSON.stringify({ from: current.pipeline_stage, to: data.stage })}::jsonb)
        on conflict (dedupe_key) do nothing
      `;
      return { id: data.prospectId, from: current.pipeline_stage, stage: data.stage };
    });
  });

/** Verification is separate from discovery and requires a Super Admin plus recorded evidence. */
export const verifyBuyerProspect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(verifyInput)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin approval required for buyer verification.");
    const sql = await getSql();
    const rows = await sql<{ id: string; pipeline_stage: string; verification_status: string }>`
      select id, pipeline_stage, verification_status from bridge_buyer_prospects
      where id = ${data.prospectId}
        and (${actor.internalRole === "super_admin"} or organization_scope = ${actor.organizationName})
      limit 1
    `;
    const prospect = rows[0];
    if (!prospect) throw new Error("Buyer prospect not found");
    if (data.verificationStatus === "CONTRACTED_PARTNER" && prospect.pipeline_stage !== "CONTRACT_REVIEW") {
      throw new Error("Contracted-partner status requires the prospect to be in CONTRACT_REVIEW.");
    }
    await sql`
      update bridge_buyer_prospects
      set verification_status = ${data.verificationStatus},
          verification_evidence_ref = ${data.legalReference},
          updated_at = now()
      where id = ${data.prospectId}
    `;
    await writeAudit({
      actorUserId: actor.userId, action: "buyer_prospect.verify",
      entityType: "bridge_buyer_prospect", entityId: data.prospectId,
      metadata: { from: prospect.verification_status, to: data.verificationStatus, evidenceRecorded: true },
    }, sql);
    return { id: data.prospectId, verificationStatus: data.verificationStatus, evidenceRecorded: true };
  });

/** Persistent notifications are always scoped to the authenticated recipient. */
export const listMyBridgeNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireOperator(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string; event_type: string; entity_type: string; entity_id: string;
      payload: string; read_at: string | null; created_at: string;
    }>`
      select id, event_type, entity_type, entity_id, payload::text as payload,
             read_at::text as read_at, created_at::text as created_at
      from bridge_notifications
      where recipient_user_id = ${actor.userId}
      order by created_at desc limit 100
    `;
    return { notifications: rows };
  });
