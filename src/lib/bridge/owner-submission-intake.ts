import { createServerFn } from "@tanstack/react-start";
import { dispatchOwnerSubmissionNotification } from "./owner-submission-notifications";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { Sql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor, type BridgeActor } from "./session";
import { loadTitle } from "./titles";
import { canMutateTitle } from "./rbac";
import { writeAudit } from "./audit";
import { canResubmitOwnerAdminSubmission, evaluateOwnerAdminSubmissionReadiness } from "./owner-admin-submission-policy";

type IntakeTitle = NonNullable<Awaited<ReturnType<typeof loadTitle>>>;

async function assertOwnerOrActiveStudio(actor: BridgeActor, title: IntakeTitle, tx?: Sql) {
  if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
    throw new Error("Verified Creator or Studio owner access required");
  }
  if (!canMutateTitle(actor, title, "title.update_own", "title.license")) {
    throw new Error("Only the verified title owner or authorized Studio organization can submit this title");
  }
  if (title.ownerAccountType === "studio") {
    if (!title.ownerOrganizationId || actor.accountType !== "studio" || actor.organizationId !== title.ownerOrganizationId) {
      throw new Error("Active Studio organization membership required");
    }
    const db = tx ?? await getSql();
    const membership = await db<{ active: boolean }>`
      select exists (
        select 1 from bridge_organization_memberships
        where organization_id = ${title.ownerOrganizationId}
          and user_id = ${actor.userId}
          and status = 'active'
      ) as active
    `;
    if (!membership[0]?.active) throw new Error("Active Studio organization membership required");
  } else if (title.ownerUserId !== actor.userId) {
    throw new Error("Only the verified title owner can submit this title");
  }
}

async function readiness(sql: Awaited<ReturnType<typeof getSql>>, title: IntakeTitle) {
  const rows = await sql<{ master_ready: boolean; artwork_ready: boolean }>`
    select
      exists (
        select 1 from bridge_assets a
        where a.title_id = t.id
          and a.kind = 'master'
          and a.s3_key = t.master_key
          and nullif(t.master_key, '') is not null
          and coalesce(a.byte_size, 0) > 0
          and a.storage_business_state = 'ACTIVE'
          and a.restore_state = 'READY'
      ) as master_ready,
      exists (
        select 1 from bridge_assets a
        where a.title_id = t.id
          and a.kind in ('poster', 'poster_vertical')
          and a.s3_key = t.poster_key
          and nullif(t.poster_key, '') is not null
          and coalesce(a.byte_size, 0) > 0
          and a.storage_business_state = 'ACTIVE'
          and a.restore_state = 'READY'
      ) as artwork_ready
    from bridge_titles t
    where t.id = ${title.id}
  `;
  return {
    masterVerified: Boolean(rows[0]?.master_ready),
    artworkVerified: Boolean(rows[0]?.artwork_ready),
  };
}

export const getOwnerSubmissionReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found");
    await assertOwnerOrActiveStudio(actor, title);
    const db = await getSql();
    const assets = await readiness(db, title);
    const existingRows = await db<{ submission_status: string }>`
      select submission_status
      from bridge_title_owner_submissions
      where title_id = ${title.id}
      limit 1
    `;
    const existingStatus = existingRows[0]?.submission_status ?? null;
    const submissionAvailable = canResubmitOwnerAdminSubmission(existingStatus);
    const statusReady = title.status === "PREPARING";
    const evaluated = evaluateOwnerAdminSubmissionReadiness({
      titleStatus: title.status,
      masterKey: title.masterKey,
      posterKey: title.posterKey,
      masterAssetVerified: assets.masterVerified,
      artworkAssetVerified: assets.artworkVerified,
      // assertOwnerOrActiveStudio has already verified the active Studio membership.
      activeStudioMembership: true,
    });
    return {
      titleStatus: title.status,
      ...assets,
      submissionStatus: existingStatus,
      canSubmit: evaluated.eligible && submissionAvailable,
      blockers: [
        ...(!submissionAvailable ? [`Submission already ${existingStatus?.toLowerCase().replaceAll("_", " ")}`] : []),
        ...(!statusReady ? ["Title must remain PREPARING"] : []),
        ...(!evaluated.masterReady ? ["Canonical verified master is missing or not independently verified"] : []),
        ...(!evaluated.artworkReady ? ["Canonical verified poster artwork is missing or not independently verified"] : []),
      ],
    };
  });

export const submitTitleToBridgeAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const submittedStatus = "SUBMITTED";
    let notificationEventId = "";

    await sql.transaction(async (tx) => {
      const lockedRows = await tx<{
        id: string;
        slug: string;
        name: string;
        owner_user_id: string;
        owner_account_type: string;
        owner_organization_id: string | null;
        status: string;
        name_ml: string | null;
        master_key: string | null;
        poster_key: string | null;
      }>`
        select id, slug, name, owner_user_id, owner_account_type, owner_organization_id,
          status, name_ml, master_key, poster_key
        from bridge_titles where id = ${data.titleId} for update
      `;
      const row = lockedRows[0];
      if (!row) throw new Error("Title not found");
      const title = await loadTitle(row.id);
      if (!title) throw new Error("Title not found");
      await assertOwnerOrActiveStudio(actor, title, tx);
      if (row.status !== "PREPARING") throw new Error("Owner submission is available only while the title remains PREPARING");

      const assetState = await readiness(tx, title);
      if (!assetState.masterVerified) throw new Error("BLOCKED: canonical verified master is not ready");
      if (!assetState.artworkVerified) throw new Error("BLOCKED: canonical verified poster artwork is not ready");

      const existing = await tx<{ submission_status: string }>`
        select submission_status from bridge_title_owner_submissions
        where title_id = ${row.id} for update
      `;
      const current = existing[0]?.submission_status;
      if (!canResubmitOwnerAdminSubmission(current)) {
        throw new Error("This title already has an active or completed Admin submission");
      }
      const action = current === "NEEDS_CORRECTION" ? "RESUBMITTED" : "SUBMITTED";
      const saved = await tx<{ id: string }>`
        insert into bridge_title_owner_submissions
          (id, title_id, owner_user_id, owner_organization_id, details, submission_status,
           submitted_at, submitted_by, updated_by, updated_at)
        values (
          md5(random()::text || clock_timestamp()::text), ${row.id}, ${row.owner_user_id},
          ${row.owner_organization_id}, '{}'::jsonb, 'SUBMITTED', now(), ${actor.userId},
          ${actor.userId}, now()
        )
        on conflict (title_id) do update set
          submission_status = 'SUBMITTED',
          submitted_at = now(),
          submitted_by = excluded.submitted_by,
          updated_by = excluded.updated_by,
          updated_at = now()
        where bridge_title_owner_submissions.submission_status in ('DRAFT', 'NEEDS_CORRECTION')
        returning id
      `;
      if (!saved[0]) throw new Error("Duplicate submission blocked; refresh the title workspace");

      const eventRows = await tx<{ id: string }>`
        insert into bridge_owner_submission_events
          (title_id, submission_kind, action, from_status, to_status, actor_user_id)
        values (${row.id}, 'finished_film', ${action}, ${current ?? "DRAFT"}, 'SUBMITTED', ${actor.userId})
        returning id::text as id
      `;
      const eventId = eventRows[0]?.id;
      if (!eventId) throw new Error("Submission event could not be recorded");

      notificationEventId = eventId;
      const creatorEmailRows = await tx<{ email: string | null }>`
        select email from bridge_profiles where user_id = ${actor.userId} limit 1
      `;
      const creatorEmail = creatorEmailRows[0]?.email?.trim();
      const creatorEventKey = `owner-submission:${eventId}:creator`;
      if (creatorEmail) {
        await tx`
          insert into bridge_notification_outbox
            (event_key, recipient_email, subject, text_body)
          values (
            ${creatorEventKey}, ${creatorEmail},
            ${`Crayons Bridge received: ${row.name}`},
            ${`We received your title submission "${row.name}" for Crayons Bridge intake. Submission reference: ${eventId}. This confirms receipt only; QC, Rights, Legal, Licensing and Marketplace decisions remain separate. View your workspace: https://www.crayonspictures.in/creator`}
          )
          on conflict (event_key) do nothing
        `;
      }

      const adminEventKey = `owner-submission:${eventId}:super-admin`;
      await tx`
        insert into bridge_notification_outbox
          (event_key, recipient_email, subject, text_body)
        select
          ${adminEventKey} || ':' || p.user_id,
          p.email,
          ${`New Crayons Bridge submission: ${row.name}`},
          ${`A new title submission "${row.name}" is awaiting Super Admin intake review. Reference: ${eventId}. Open the Super Admin dashboard: https://www.crayonspictures.in/admin`
        from bridge_profiles p
        where p.internal_role = 'super_admin' and nullif(trim(p.email), '') is not null
        on conflict (event_key) do nothing
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "title.owner_submission_submitted_to_bridge_admin",
        entityType: "bridge_title",
        entityId: row.id,
        metadata: { titleStatus: row.status, submissionStatus: submittedStatus, masterVerified: true, artworkVerified: true },
      }, tx);
    });

    // Dispatch is best-effort after the durable outbox rows have committed. A delivery
    // failure leaves the submission intact and the notification retryable.
    const dispatchKeys = await sql<{ event_key: string }>`
      select event_key from bridge_notification_outbox
      where event_key like ${`owner-submission:${notificationEventId}:%`}
        and status in ('pending','failed')
      order by created_at asc
      limit 10
    `;
    const notificationResults = await Promise.all(dispatchKeys.map(({ event_key }) =>
      dispatchOwnerSubmissionNotification(event_key).catch(() => ({ sent: false as const }))
    ));

    // Admin intake is deliberately not a QC, rights, legal, licensing, or Loop publication transition.
    return {
      submitted: true as const,
      submissionStatus: submittedStatus,
      titleStatus: "PREPARING" as const,
      notificationsQueued: dispatchKeys.length,
      notificationsSent: notificationResults.filter((result) => result.sent).length,
    };
  });

export const listBridgeAdminOwnerSubmissionQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }
    const sql = await getSql();
    const rows = await sql<{
      title_id: string;
      title_name: string;
      title_status: string;
      owner_user_id: string;
      owner_email: string | null;
      owner_display_name: string | null;
      owner_organization_id: string | null;
      owner_organization_name: string | null;
      submitted_at: string | Date | null;
      submission_status: string;
    }>`
      select s.title_id, t.name as title_name, t.status as title_status,
        s.owner_user_id, p.email as owner_email, p.display_name as owner_display_name,
        s.owner_organization_id, o.legal_name as owner_organization_name,
        s.submitted_at, s.submission_status
      from bridge_title_owner_submissions s
      join bridge_titles t on t.id = s.title_id
      left join bridge_profiles p on p.user_id = s.owner_user_id
      left join bridge_organizations o on o.id = s.owner_organization_id
      where s.submission_status = 'SUBMITTED'
      order by s.submitted_at asc nulls last
      limit 200
    `;
    return { submissions: rows };
  });


export const decideBridgeOwnerSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    decision: z.enum(["ACCEPT", "REQUEST_CORRECTIONS"]),
    reason: z.string().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Only Super Admin can decide owner submissions");
    }
    const reason = data.reason?.trim() ?? "";
    if (data.decision === "REQUEST_CORRECTIONS" && !reason) {
      throw new Error("A correction reason is required");
    }
    const sql = await getSql();
    const nextStatus = data.decision === "ACCEPT" ? "ACCEPTED_INTAKE" : "NEEDS_CORRECTION";

    await sql.transaction(async (tx) => {
      const rows = await tx<{
        id: string;
        title_id: string;
        submission_status: string;
      }>`
        select id, title_id, submission_status
        from bridge_title_owner_submissions
        where title_id = ${data.titleId}
        for update
      `;
      const submission = rows[0];
      if (!submission) throw new Error("Owner submission not found");
      if (submission.submission_status !== "SUBMITTED") {
        throw new Error("Only a pending SUBMITTED owner package can receive an Admin decision");
      }

      const updated = await tx<{ id: string }>`
        update bridge_title_owner_submissions
        set submission_status = ${nextStatus},
            updated_by = ${actor.userId},
            updated_at = now()
        where id = ${submission.id}
          and submission_status = 'SUBMITTED'
        returning id
      `;
      if (!updated[0]) throw new Error("Submission changed during review; refresh and retry");

      await tx`
        insert into bridge_owner_submission_events
          (title_id, submission_kind, action, from_status, to_status, actor_user_id, reason)
        values (
          ${submission.title_id},
          'finished_film',
          ${data.decision === "ACCEPT" ? "ACCEPTED_INTAKE" : "REQUEST_CHANGES"},
          'SUBMITTED',
          ${nextStatus},
          ${actor.userId},
          ${data.decision === "REQUEST_CORRECTIONS" ? reason : null}
        )
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: data.decision === "ACCEPT"
          ? "title.owner_submission_accepted_by_admin"
          : "title.owner_submission_corrections_requested_by_admin",
        entityType: "bridge_title",
        entityId: submission.title_id,
        metadata: {
          submissionId: submission.id,
          fromStatus: "SUBMITTED",
          toStatus: nextStatus,
          reason: data.decision === "REQUEST_CORRECTIONS" ? reason : null,
          titleWorkflowAdvanced: false,
        },
      }, tx);
    });

    // Acceptance is intake acknowledgement only; it never advances QC, Rights, Legal,
    // Licensing, buyer authorization, or Loop publication.
    return { decided: true as const, submissionStatus: nextStatus };
  });

export const listMyOwnerSubmissionStatuses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Creator or Studio account required");
    }
    const sql = await getSql();
    const rows = await sql<{
      title_id: string;
      title_name: string;
      submission_status: string;
      submitted_at: string | Date | null;
      updated_at: string | Date;
    }>`
      select s.title_id, t.name as title_name, s.submission_status,
        s.submitted_at, s.updated_at
      from bridge_title_owner_submissions s
      join bridge_titles t on t.id = s.title_id
      where (
        (s.owner_user_id = ${actor.userId} and s.owner_organization_id is null)
        or (
          ${actor.accountType === "studio" && Boolean(actor.organizationId)}
          and s.owner_organization_id = ${actor.organizationId ?? null}
          and exists (
            select 1 from bridge_organization_memberships m
            where m.organization_id = s.owner_organization_id
              and m.user_id = ${actor.userId}
              and m.status = 'active'
          )
        )
      )
      order by s.updated_at desc
      limit 100
    `;
    return { submissions: rows };
  });
