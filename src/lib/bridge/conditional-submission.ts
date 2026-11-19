import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";

export const MALAYALAKKARA_RESIDENCY_ID = "858f0ec5a11bc9acd2e9c20266541a3a";

const input = z.object({
  titleId: z.literal(MALAYALAKKARA_RESIDENCY_ID),
  confirmation: z.literal("CONDITIONAL_SUBMISSION_ONLY"),
});

export const submitMalayalakkaraConditionalRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(input)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (!["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Only verified Creator or Studio accounts can request conditional submission");
    }
    assertPermission(actor, "title.update_own");

    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [title] = await tx<{ id: string; owner_user_id: string; status: string }>`
        select id, owner_user_id, status
        from bridge_titles
        where id = ${data.titleId}
        for update
      `;
      if (!title) throw new Error("Title not found");
      if (title.owner_user_id !== actor.userId) {
        throw new Error("Only the verified title owner may submit this request");
      }
      if (title.status !== "RIGHTS_REVIEW") {
        throw new Error("Malayalakkara Residency must remain in RIGHTS_REVIEW for this request");
      }

      const existing = await tx<{ id: string; status: string }>`
        select id::text, status
        from bridge_conditional_submissions
        where title_id = ${data.titleId}
          and submission_kind = 'CONDITIONAL_LEGAL_VERIFICATION'
        limit 1
      `;
      if (existing.length) {
        throw new Error("A one-time conditional submission has already been recorded");
      }

      // The title row lock serializes same-title submissions. The unique
      // constraint remains the final guard if another writer bypasses this path.
      const [record] = await tx<{ id: string; status: string }>`
        insert into bridge_conditional_submissions
          (title_id, submission_kind, status, submitted_by, metadata)
        values (
          ${data.titleId},
          'CONDITIONAL_LEGAL_VERIFICATION',
          'PENDING_LEGAL_VERIFICATION',
          ${actor.userId},
          ${JSON.stringify({
            rightsGrantApproved: false,
            sublicensingAllowed: false,
            publicationAllowed: false,
            titleLifecycleMutated: false,
            scope: "ONE_TIME_SUBMISSION_ONLY",
          })}::jsonb
        )
        returning id::text, status
      `;

      await tx`
        insert into bridge_title_events
          (title_id, from_status, to_status, actor_user_id, note)
        values (
          ${data.titleId},
          ${title.status},
          ${title.status},
          ${actor.userId},
          'One-time conditional submission recorded; independent Legal verification pending'
        )
      `;
      await tx`
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (
          ${actor.userId},
          'title.conditional_submission.create',
          'bridge_title',
          ${data.titleId},
          ${JSON.stringify({
            submissionId: record.id,
            status: record.status,
            rightsGrantApproved: false,
            sublicensingAllowed: false,
            publicationAllowed: false,
          })}::jsonb
        )
      `;
      return { submissionId: record.id, status: record.status, alreadySubmitted: false as const };
    });
  });


export const getMalayalakkaraConditionalSubmission = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.literal(MALAYALAKKARA_RESIDENCY_ID) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const [title] = await sql<{ id: string; owner_user_id: string }>`
      select id, owner_user_id from bridge_titles where id = ${data.titleId}
    `;
    if (!title || title.owner_user_id !== actor.userId) {
      throw new Error("Not found");
    }
    const [submission] = await sql<{ id: string; status: string; submitted_at: string | Date }>`
      select id::text, status, submitted_at
      from bridge_conditional_submissions
      where title_id = ${data.titleId}
        and submission_kind = 'CONDITIONAL_LEGAL_VERIFICATION'
      limit 1
    `;
    return submission
      ? { submissionId: submission.id, status: submission.status, submittedAt: new Date(submission.submitted_at).toISOString() }
      : null;
  });
