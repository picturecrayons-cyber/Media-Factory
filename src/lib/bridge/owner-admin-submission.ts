import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { canMutateTitle, canReadTitle } from "./rbac";
import { writeAudit } from "./audit";
import { canResubmitOwnerAdminSubmission, evaluateOwnerAdminSubmissionReadiness } from "./owner-admin-submission-policy";

type Readiness = {
  masterReady: boolean;
  artworkReady: boolean;
  activeStudioMembership: boolean;
  eligible: boolean;
};

async function ownerReadiness(actor: Awaited<ReturnType<typeof requireVerifiedActor>>, titleId: string): Promise<Readiness> {
  const title = await loadTitle(titleId);
  if (!title) throw new Error("Title not found");
  const isOwnerAccount = !actor.internalRole &&
    (actor.accountType === "independent_creator" || actor.accountType === "studio") &&
    title.ownerAccountType === actor.accountType &&
    canMutateTitle(actor, title, "title.update_own", "title.license");
  if (!isOwnerAccount) throw new Error("Only the verified Creator or Studio title owner can submit to Bridge Admin");

  const sql = await getSql();
  let activeStudioMembership = actor.accountType !== "studio";
  if (actor.accountType === "studio") {
    if (!title.ownerOrganizationId || !actor.organizationId || title.ownerOrganizationId !== actor.organizationId) {
      throw new Error("This title does not belong to your Studio organization");
    }
    const rows = await sql<{ active: boolean }>`
      select exists (
        select 1 from bridge_organization_memberships
        where organization_id = ${title.ownerOrganizationId}
          and user_id = ${actor.userId}
          and status = 'active'
      ) as active
    `;
    activeStudioMembership = Boolean(rows[0]?.active);
  }
  const assets = await sql<{ master_ready: boolean; artwork_ready: boolean }>`
    select
      exists (
        select 1 from bridge_assets a
        where a.title_id = t.id
          and a.kind = 'master'
          and a.s3_key = t.master_key
          and coalesce(a.byte_size, 0) > 0
          and a.storage_business_state = 'ACTIVE'
          and a.restore_state = 'READY'
      ) as master_ready,
      exists (
        select 1 from bridge_assets a
        where a.title_id = t.id
          and a.kind in ('poster', 'poster_vertical', 'poster_horizontal')
          and a.s3_key = t.poster_key
          and coalesce(a.byte_size, 0) > 0
          and a.storage_business_state = 'ACTIVE'
          and a.restore_state = 'READY'
      ) as artwork_ready
    from bridge_titles t where t.id = ${title.id}
  `;
  const masterReady = Boolean(assets[0]?.master_ready);
  const artworkReady = Boolean(assets[0]?.artwork_ready);
  return evaluateOwnerAdminSubmissionReadiness({
    titleStatus: title.status,
    masterKey: title.masterKey,
    posterKey: title.posterKey,
    masterAssetVerified: masterReady,
    artworkAssetVerified: artworkReady,
    activeStudioMembership,
  });
}

/** Read-only readiness and latest submission state for the authenticated title owner. */
export const getOwnerAdminSubmission = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Title not found");
    const readiness = await ownerReadiness(actor, title.id);
    const sql = await getSql();
    const rows = await sql<{ submission_status: string; submitted_at: string | Date | null }>`
      select submission_status, submitted_at
      from bridge_title_owner_submissions
      where title_id = ${title.id}
      limit 1
    `;
    return {
      readiness,
      submission: rows[0] ? {
        status: rows[0].submission_status,
        submittedAt: rows[0].submitted_at ? new Date(rows[0].submitted_at).toISOString() : null,
      } : null,
    };
  });

/** Creator/Studio intake only. This records Admin intake and NEVER advances title/QC status. */
export const submitTitleToBridgeAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Creator or Studio account required");
    }
    const sql = await getSql();
    const result = await sql.transaction(async (tx) => {
      const lockedRows = await tx<{
        id: string; status: string; owner_user_id: string; owner_account_type: string;
        owner_organization_id: string | null; master_key: string | null; poster_key: string | null;
      }>`
        select id, status, owner_user_id, owner_account_type, owner_organization_id, master_key, poster_key
        from bridge_titles where id = ${data.titleId} for update
      `;
      const title = lockedRows[0];
      if (!title) throw new Error("Title not found");
      if (title.status !== "PREPARING") throw new Error("Title must remain in PREPARING before Admin intake");
      if (title.owner_account_type !== actor.accountType) {
        throw new Error("The title owner account type does not match the submitting account");
      }
      if (!canMutateTitle(actor, {
        ownerUserId: title.owner_user_id,
        ownerAccountType: title.owner_account_type as "independent_creator" | "studio",
        ownerOrganizationId: title.owner_organization_id,
      }, "title.update_own", "title.license")) {
        throw new Error("You are not authorized to submit this title");
      }
      if (actor.accountType === "independent_creator" && title.owner_user_id !== actor.userId) {
        throw new Error("Creator submission is limited to your own title");
      }
      if (actor.accountType === "studio") {
        if (title.owner_account_type !== "studio" || !title.owner_organization_id ||
            title.owner_organization_id !== actor.organizationId) {
          throw new Error("Title ownership does not match your Studio organization");
        }
        const membership = await tx<{ active: boolean }>`
          select exists (
            select 1 from bridge_organization_memberships
            where organization_id = ${title.owner_organization_id}
              and user_id = ${actor.userId}
              and status = 'active'
          ) as active
        `;
        if (!membership[0]?.active) throw new Error("Active Studio membership is required");
      }
      if (!title.master_key || !title.poster_key) {
        throw new Error("Canonical master and artwork keys are required before Admin submission");
      }
      const assets = await tx<{ master_ready: boolean; artwork_ready: boolean }>`
        select
          exists (
            select 1 from bridge_assets a
            where a.title_id = t.id and a.kind = 'master'
              and a.s3_key = t.master_key and coalesce(a.byte_size, 0) > 0
              and a.storage_business_state = 'ACTIVE' and a.restore_state = 'READY'
          ) as master_ready,
          exists (
            select 1 from bridge_assets a
            where a.title_id = t.id and a.kind in ('poster','poster_vertical','poster_horizontal')
              and a.s3_key = t.poster_key and coalesce(a.byte_size, 0) > 0
              and a.storage_business_state = 'ACTIVE' and a.restore_state = 'READY'
          ) as artwork_ready
        from bridge_titles t where t.id = ${title.id}
      `;
      if (!assets[0]?.master_ready) throw new Error("Canonical verified master is missing or not storage-verified");
      if (!assets[0]?.artwork_ready) throw new Error("Canonical verified poster/artwork is missing or not storage-verified");

      const existing = await tx<{
        submission_status: string; owner_user_id: string; owner_organization_id: string | null;
      }>`
        select submission_status, owner_user_id, owner_organization_id
        from bridge_title_owner_submissions
        where title_id = ${title.id} for update
      `;
      const current = existing[0]?.submission_status;
      if (existing[0] && (
        existing[0].owner_user_id !== title.owner_user_id ||
        existing[0].owner_organization_id !== title.owner_organization_id
      )) {
        throw new Error("Existing owner submission identity does not match the canonical title owner");
      }
      if (current === "SUBMITTED") throw new Error("This title is already submitted to Bridge Admin");
      if (!canResubmitOwnerAdminSubmission(current)) {
        throw new Error("This owner submission is not eligible for resubmission");
      }
      const id = randomBytes(16).toString("hex");
      await tx`
        insert into bridge_title_owner_submissions
          (id, title_id, owner_user_id, owner_organization_id, details, submission_status,
           submitted_at, submitted_by, updated_by, updated_at)
        values
          (${id}, ${title.id}, ${title.owner_user_id}, ${title.owner_organization_id},
           jsonb_build_object('submissionSource','title_operations','masterKeyVerified',true,'artworkKeyVerified',true),
           'SUBMITTED', now(), ${actor.userId}, ${actor.userId}, now())
        on conflict (title_id) do update set
          submission_status = 'SUBMITTED',
          submitted_at = now(),
          submitted_by = excluded.submitted_by,
          updated_by = excluded.updated_by,
          updated_at = now()
      `;
      await tx`
        insert into bridge_owner_submission_events
          (title_id, submission_kind, action, from_status, to_status, actor_user_id)
        values (${title.id}, 'finished_film',
          ${current === "NEEDS_CORRECTION" ? "RESUBMITTED" : "SUBMITTED"},
          ${current ?? null}, 'SUBMITTED', ${actor.userId})
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "title.owner_submission.submitted_to_bridge_admin",
        entityType: "bridge_title",
        entityId: title.id,
        metadata: {
          accountType: actor.accountType,
          organizationId: actor.organizationId ?? null,
          titleStatusPreserved: "PREPARING",
          qcApprovalGranted: false,
          rightsApprovalGranted: false,
          masterVerified: true,
          artworkVerified: true,
        },
      }, tx);
      return { submitted: true as const, titleStatus: "PREPARING" as const };
    });
    return result;
  });

/** Admin intake queue; read-only list, with no implicit QC transition or approval. */
export const listBridgeAdminOwnerSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!["admin", "super_admin"].includes(actor.internalRole ?? "")) {
      throw new Error("Bridge Admin access required");
    }
    const sql = await getSql();
    const rows = await sql<{
      title_id: string; title_name: string; title_status: string; owner_user_id: string;
      owner_email: string | null; owner_display_name: string | null; owner_account_type: string;
      owner_organization_id: string | null; organization_name: string | null;
      submitted_at: string | Date | null;
    }>`
      select s.title_id, t.name as title_name, t.status as title_status,
        s.owner_user_id, p.email as owner_email, p.display_name as owner_display_name,
        t.owner_account_type, s.owner_organization_id, o.legal_name as organization_name,
        s.submitted_at
      from bridge_title_owner_submissions s
      join bridge_titles t on t.id = s.title_id
      left join bridge_profiles p on p.user_id = s.owner_user_id
      left join bridge_organizations o on o.id = s.owner_organization_id
      where s.submission_status = 'SUBMITTED' and t.status = 'PREPARING'
      order by s.submitted_at asc nulls last
      limit 200
    `;
    return { submissions: rows.map((row) => ({
      titleId: row.title_id,
      titleName: row.title_name,
      titleStatus: row.title_status,
      ownerUserId: row.owner_user_id,
      ownerName: row.owner_display_name ?? row.owner_email ?? "Owner",
      ownerAccountType: row.owner_account_type,
      organizationName: row.organization_name,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    })) };
  });
