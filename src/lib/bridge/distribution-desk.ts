import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";
import { buildDistributionDraft, assertDraftCanBeApproved } from "./distribution-draft-core";

const inquiryInput = z.object({
  sourceReference: z.string().trim().min(3).max(500),
  buyerName: z.string().trim().min(1).max(160),
  buyerEmail: z.string().trim().email().max(320),
  inquiryText: z.string().trim().min(1).max(12000),
  requestSummary: z.record(z.string(), z.unknown()).default({}),
  titleId: z.string().min(8).nullable().optional(),
});

export const createDistributionInquiry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inquiryInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const sql = await getSql();
    const titleRows = data.titleId
      ? await sql<{ id: string; name: string }>`select id, name from bridge_titles where id = ${data.titleId} and merged_into_title_id is null limit 1`
      : [];
    if (data.titleId && !titleRows[0]) throw new Error("Unknown or merged Bridge title");
    const draft = buildDistributionDraft({
      buyerName: data.buyerName,
      titleName: titleRows[0]?.name,
      inquiryText: data.inquiryText,
    });
    const rows = await sql<{ id: string }>`
      insert into bridge_distribution_inquiries
        (source_reference, buyer_name, buyer_email, inquiry_text, request_summary, title_id,
         draft_subject, draft_body, status, created_by, updated_by)
      values (
        ${data.sourceReference}, ${data.buyerName}, ${data.buyerEmail}, ${data.inquiryText},
        ${JSON.stringify(data.requestSummary)}, ${data.titleId ?? null},
        ${draft.subject}, ${draft.body}, 'DRAFT_READY', ${actor.userId}, ${actor.userId}
      )
      returning id
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "distribution.inquiry_draft_created",
      entityType: "bridge_distribution_inquiry",
      entityId: rows[0].id,
      metadata: { titleId: data.titleId ?? null, sourceReference: data.sourceReference, outboundAction: "NONE" },
    });
    return { id: rows[0].id, status: "DRAFT_READY" as const, subject: draft.subject, body: draft.body };
  });

export const listDistributionInquiries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const sql = await getSql();
    const rows = await sql<{
      id: string; source_reference: string; buyer_name: string; buyer_email: string;
      inquiry_text: string; title_id: string | null; title_name: string | null;
      draft_subject: string; draft_body: string; status: string; created_at: string;
      reviewed_by: string | null; reviewed_at: string | null;
    }>`
      select i.id, i.source_reference, i.buyer_name, i.buyer_email, i.inquiry_text,
        i.title_id, t.name as title_name, i.draft_subject, i.draft_body,
        i.status, i.created_at, i.reviewed_by, i.reviewed_at
      from bridge_distribution_inquiries i
      left join bridge_titles t on t.id = i.title_id
      order by i.created_at desc limit ${data.limit}
    `;
    return { inquiries: rows };
  });

export const saveDistributionDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    inquiryId: z.string().uuid(),
    draftSubject: z.string().trim().min(1).max(300),
    draftBody: z.string().trim().min(1).max(12000),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update bridge_distribution_inquiries
      set draft_subject = ${data.draftSubject}, draft_body = ${data.draftBody},
          status = 'DRAFT_READY', updated_by = ${actor.userId}, updated_at = now(),
          reviewed_by = null, reviewed_at = null
      where id = ${data.inquiryId} and status <> 'APPROVED_DRAFT'
      returning id
    `;
    if (!rows[0]) throw new Error("Inquiry not found or already approved; reopen via a separately reviewed workflow");
    await writeAudit({
      actorUserId: actor.userId, action: "distribution.draft_saved",
      entityType: "bridge_distribution_inquiry", entityId: data.inquiryId,
      metadata: { outboundAction: "NONE" },
    });
    return { id: data.inquiryId, status: "DRAFT_READY" as const };
  });

export const approveDistributionDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ inquiryId: z.string().uuid(), explicitApproval: z.literal(true) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const sql = await getSql();
    const drafts = await sql<{ draft_subject: string; draft_body: string; status: string }>`
      select draft_subject, draft_body, status from bridge_distribution_inquiries
      where id = ${data.inquiryId} limit 1
    `;
    const draft = drafts[0];
    if (!draft || draft.status !== "DRAFT_READY") throw new Error("Only an editable draft can be approved");
    assertDraftCanBeApproved({
      draftSubject: draft.draft_subject, draftBody: draft.draft_body,
      reviewerUserId: actor.userId, explicitApproval: data.explicitApproval,
    });
    const updated = await sql<{ id: string }>`
      update bridge_distribution_inquiries
      set status = 'APPROVED_DRAFT', reviewed_by = ${actor.userId}, reviewed_at = now(),
          updated_by = ${actor.userId}, updated_at = now()
      where id = ${data.inquiryId} and status = 'DRAFT_READY'
      returning id
    `;
    if (!updated[0]) throw new Error("Draft changed during review; reload before approving");
    await writeAudit({
      actorUserId: actor.userId, action: "distribution.draft_human_approved",
      entityType: "bridge_distribution_inquiry", entityId: data.inquiryId,
      metadata: { outboundAction: "NONE", note: "Approval records human review only; no message was sent." },
    });
    return { id: data.inquiryId, status: "APPROVED_DRAFT" as const, outboundAction: "NONE" as const };
  });
