import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const EVIDENCE_TYPES = [
  "FINISHED_FILM_AGREEMENT",
  "DISTRIBUTION_AGREEMENT",
  "OWNERSHIP_CHAIN_OF_TITLE",
  "AUTHOR_ASSIGNMENT",
  "OTHER",
] as const;

async function requireTitleOwner(userId: string, titleId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  const title = await loadTitle(titleId);
  // A verified Super Admin who is also the recorded Creator owner may
  // manage that exact title's evidence; this grants no access to other owners.
  const isInternalOwnerException =
    actor.internalRole === "super_admin" &&
    actor.accountType === "independent_creator" &&
    title?.ownerAccountType === "independent_creator" &&
    title.ownerUserId === actor.userId;
  if (!title || (!actor.internalRole && !["independent_creator", "studio"].includes(actor.accountType)) ||
    (actor.internalRole && !isInternalOwnerException)) {
    throw new Error("Title not found for this owner account");
  }
  if (actor.accountType !== title.ownerAccountType) throw new Error("Owner account type mismatch");
  if (actor.internalRole && !isInternalOwnerException) throw new Error("Internal staff must use the reviewer workflow");
  if (title.ownerAccountType === "independent_creator") {
    if (title.ownerUserId !== actor.userId) throw new Error("This title belongs to another Creator");
  } else {
    if (!actor.organizationId || actor.organizationId !== title.ownerOrganizationId) {
      throw new Error("Active membership in the title-owning Studio is required");
    }
    const sql = await getSql();
    const memberships = await sql<{ active: boolean }>`
      select exists (
        select 1 from bridge_organization_memberships
        where organization_id = ${actor.organizationId}
          and user_id = ${actor.userId}
          and status = 'active'
      ) as active
    `;
    if (!memberships[0]?.active) throw new Error("Active Studio membership is required");
  }
  return { actor, title };
}

async function assertEvidenceEditable(titleId: string, userId: string, status: string) {
  if (["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(status)) {
    throw new Error("Evidence changes are locked for buyer-facing or licensed titles. Contact the Legal Reviewer.");
  }
  const sql = await getSql();
  const rows = await sql<{ submission_status: string }>`
    select submission_status from bridge_title_owner_submissions
    where title_id = ${titleId} and owner_user_id = ${userId} limit 1
  `;
  if (rows[0]?.submission_status === "SUBMITTED") {
    throw new Error("This package is submitted. Legal must return it for correction before further edits.");
  }
}

export const listTitleOwnerEvidence = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    await requireTitleOwner(context.userId, data.titleId);
    const sql = await getSql();
    const rows = await sql<{
      id: string; document_type: string; file_name: string; content_type: string;
      byte_size: number | null; status: string; created_at: string; verified_at: string | null;
    }>`
      select d.id, d.document_type, d.file_name, d.content_type, d.byte_size,
        d.status, d.created_at, d.verified_at
      from bridge_title_document_links l
      join bridge_creator_documents d on d.id = l.document_id
      where l.title_id = ${data.titleId}
        and d.owner_user_id = (select owner_user_id from bridge_titles where id = ${data.titleId})
        and d.owner_account_type = (select owner_account_type from bridge_titles where id = ${data.titleId})
        and d.owner_organization_id is not distinct from (select owner_organization_id from bridge_titles where id = ${data.titleId})
      order by d.created_at desc
    `;
    return { documents: rows };
  });

export const requestTitleOwnerEvidenceUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    documentType: z.enum(EVIDENCE_TYPES),
    fileName: z.string().min(1).max(120),
    byteSize: z.number().int().positive().max(MAX_PDF_BYTES),
  }))
  .handler(async ({ context, data }) => {
    const { actor, title } = await requireTitleOwner(context.userId, data.titleId);
    await assertEvidenceEditable(title.id, actor.userId, title.status);
    const id = randomBytes(16).toString("hex");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-100) || "evidence.pdf";
    const storageKey = `creator-evidence/${actor.userId}/${title.id}/${id}.pdf`;
    const { signUpload } = await import("./oci-object-storage.server");
    const signed = await signUpload({
      key: storageKey,
      contentType: "application/pdf",
      expiresIn: 900,
    });
    const sql = await getSql();
    await sql.transaction(async (tx) => {
      await tx`
        insert into bridge_creator_documents (
          id, owner_user_id, owner_account_type, owner_organization_id,
          document_type, file_name, content_type, byte_size, storage_key, status, created_by
        ) values (
          ${id}, ${actor.userId}, ${actor.accountType}, ${actor.accountType === "studio" ? actor.organizationId : null},
          ${data.documentType}, ${safeName}, 'application/pdf', ${data.byteSize},
          ${storageKey}, 'PENDING_UPLOAD', ${actor.userId}
        )
      `;
      await tx`
        insert into bridge_title_document_links (id, title_id, document_id, evidence_type, linked_by)
        values (${randomBytes(16).toString("hex")}, ${title.id}, ${id}, ${data.documentType}, ${actor.userId})
      `;
    });
    await writeAudit({
      actorUserId: actor.userId,
      action: "owner.evidence_upload_requested",
      entityType: "bridge_creator_document",
      entityId: id,
      metadata: { titleId: title.id, documentType: data.documentType, byteSize: data.byteSize },
    });
    return { documentId: id, uploadUrl: signed.url, method: signed.method };
  });

export const confirmTitleOwnerEvidenceUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8), documentId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const { actor, title } = await requireTitleOwner(context.userId, data.titleId);
    const sql = await getSql();
    const rows = await sql<{
      id: string; document_type: string; storage_key: string; byte_size: number;
      content_type: string; status: string;
    }>`
      select d.id, d.document_type, d.storage_key, d.byte_size, d.content_type, d.status
      from bridge_creator_documents d
      join bridge_title_document_links l on l.document_id = d.id and l.title_id = ${title.id}
      where d.id = ${data.documentId} and d.owner_user_id = ${actor.userId}
        and d.owner_account_type = ${actor.accountType}
        and d.owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
      limit 1
    `;
    let doc = rows[0];
    if (!doc) {
      const pending = await sql<typeof doc>`
        select id, document_type, storage_key, byte_size, content_type, status
        from bridge_creator_documents
        where id = ${data.documentId} and owner_user_id = ${actor.userId}
          and owner_account_type = ${actor.accountType}
          and owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
          and status = 'PENDING_UPLOAD'
        limit 1
      `;
      doc = pending[0];
    }
    if (!doc) throw new Error("Pending document upload not found");
    if (doc.status === "VERIFIED") return { verified: true };
    if (doc.status !== "PENDING_UPLOAD") throw new Error("This document upload is no longer active");
    const { verifyPdfObject } = await import("./oci-object-storage.server");
    const object = await verifyPdfObject(doc.storage_key, Number(doc.byte_size));
    if (object.byteSize > MAX_PDF_BYTES) throw new Error("PDF exceeds the 20 MB limit");
    await sql.transaction(async (tx) => {
      await tx`
        update bridge_creator_documents
        set status = 'VERIFIED', verified_at = now(), updated_at = now()
        where id = ${doc!.id} and owner_user_id = ${actor.userId}
          and owner_account_type = ${actor.accountType}
          and owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
          and status = 'PENDING_UPLOAD'
      `;
      await tx`
        insert into bridge_title_document_links (id, title_id, document_id, evidence_type, linked_by)
        values (${randomBytes(16).toString("hex")}, ${title.id}, ${doc!.id}, ${doc!.document_type}, ${actor.userId})
        on conflict (title_id, document_id, evidence_type) do nothing
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "owner.evidence_uploaded",
        entityType: "bridge_creator_document",
        entityId: doc!.id,
        metadata: { titleId: title.id, documentType: doc!.document_type, byteSize: object.byteSize },
      }, tx);
    });
    return { verified: true };
  });

export const revokePendingTitleOwnerEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8), documentId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const { actor, title } = await requireTitleOwner(context.userId, data.titleId);
    const sql = await getSql();
    const changed = await sql.transaction(async (tx) => {
      const rows = await tx<{ id: string }>`
        update bridge_creator_documents
        set status = 'REVOKED', revoked_at = now(), updated_at = now()
        where id = ${data.documentId}
          and owner_user_id = ${actor.userId}
          and owner_account_type = ${actor.accountType}
          and owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
          and status = 'PENDING_UPLOAD'
          and exists (
            select 1 from bridge_title_document_links l
            where l.document_id = bridge_creator_documents.id and l.title_id = ${title.id}
          )
        returning id
      `;
      if (rows.length) {
        await tx`
          delete from bridge_title_document_links
          where title_id = ${title.id} and document_id = ${data.documentId}
        `;
      }
      return rows;
    });
    if (!changed.length) throw new Error("Only an unverified upload can be undone. Verified evidence is retained; upload a replacement to preserve the audit trail.");
    await writeAudit({
      actorUserId: actor.userId,
      action: "owner.evidence_upload_undone",
      entityType: "bridge_creator_document",
      entityId: data.documentId,
      metadata: { titleId: title.id },
    });
    return { undone: true };
  });

const rightsDetailsSchema = z.object({
  platforms: z.array(z.enum(["SVOD", "TVOD", "AVOD"])),
  territory: z.string().max(300),
  rightsStart: z.string().max(30),
  rightsEnd: z.string().max(30),
  rightsBasis: z.string().max(300),
  signatoryName: z.string().max(160),
  signatoryCapacity: z.string().max(160),
  revenueShare: z.string().max(300),
  paymentTerms: z.string().max(500),
  ownerDeclaration: z.boolean(),
});

export const saveTitleOwnerRightsDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8), details: rightsDetailsSchema }))
  .handler(async ({ context, data }) => {
    const { actor, title } = await requireTitleOwner(context.userId, data.titleId);
    await assertEvidenceEditable(title.id, actor.userId, title.status);
    const sql = await getSql();
    const existing = await sql<{ submission_status: string }>`
      select submission_status from bridge_title_owner_submissions
    where title_id = ${title.id}
      and owner_user_id = ${actor.userId}
      and owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
    limit 1
    `;
    if (existing[0] && existing[0].submission_status === "SUBMITTED") {
      throw new Error("This rights package is submitted. Legal must return it for correction before the Creator can edit it.");
    }
    await sql`
      insert into bridge_title_owner_submissions (
        id, title_id, owner_user_id, owner_organization_id, details,
        submission_status, updated_by
      ) values (
        ${randomBytes(16).toString("hex")}, ${title.id}, ${actor.userId}, ${actor.accountType === "studio" ? actor.organizationId : null},
        ${JSON.stringify(data.details)}::jsonb, 'DRAFT', ${actor.userId}
      )
      on conflict (title_id) do update set
        details = excluded.details, submission_status = 'DRAFT',
        updated_by = excluded.updated_by, updated_at = now()
      where bridge_title_owner_submissions.owner_user_id = excluded.owner_user_id
        and bridge_title_owner_submissions.owner_organization_id is not distinct from excluded.owner_organization_id
        and bridge_title_owner_submissions.submission_status in ('DRAFT', 'NEEDS_CORRECTION')
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "owner.rights_draft_saved",
      entityType: "bridge_title_owner_submission",
      entityId: title.id,
      metadata: { titleId: title.id },
    });
    return { saved: true };
  });

export const submitTitleOwnerRightsPackage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8), details: rightsDetailsSchema }))
  .handler(async ({ context, data }) => {
    const { actor, title } = await requireTitleOwner(context.userId, data.titleId);
    await assertEvidenceEditable(title.id, actor.userId, title.status);
    if (!data.details.ownerDeclaration) throw new Error("Confirm the Creator declaration before submitting.");
    if (
      data.details.platforms.length === 0 ||
      !data.details.territory.trim() ||
      !data.details.rightsStart ||
      !data.details.rightsEnd ||
      !data.details.rightsBasis.trim() ||
      !data.details.signatoryName.trim() ||
      !data.details.signatoryCapacity.trim() ||
      !data.details.revenueShare.trim() ||
      !data.details.paymentTerms.trim()
    ) throw new Error("Complete all rights scope, signatory and commercial-term inputs before submitting.");
    const sql = await getSql();
    const required = await sql<{ document_type: string }>`
      select distinct d.document_type
      from bridge_title_document_links l
      join bridge_creator_documents d on d.id = l.document_id
      where l.title_id = ${title.id}
        and d.owner_user_id = ${actor.userId}
        and d.owner_account_type = ${actor.accountType}
        and d.owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
        and d.status = 'VERIFIED'
    `;
    const present = new Set(required.map((r) => r.document_type));
    const ownershipDocs = await sql<{ count: number }>`
      select count(*)::int as count
      from bridge_title_document_links l
      join bridge_creator_documents d on d.id = l.document_id
      where l.title_id = ${title.id}
        and d.owner_user_id = ${actor.userId}
        and d.owner_account_type = ${actor.accountType}
        and d.owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
        and d.document_type = 'OWNERSHIP_CHAIN_OF_TITLE'
        and d.status = 'VERIFIED'
    `;
    if (Number(ownershipDocs[0]?.count ?? 0) < 2) {
      throw new Error("Upload two separate ownership-chain PDFs: film ownership proof and New Darsan Creations rights-transfer proof.");
    }
    const mustHave = [
      "FINISHED_FILM_AGREEMENT",
      "DISTRIBUTION_AGREEMENT",
      "OWNERSHIP_CHAIN_OF_TITLE",
      "AUTHOR_ASSIGNMENT",
      "OTHER",
    ];
    const missing = mustHave.filter((kind) => !present.has(kind));
    if (missing.length) throw new Error("Upload and verify all five required evidence categories before submitting the legal package.");
    const datesValid = new Date(data.details.rightsStart).getTime() < new Date(data.details.rightsEnd).getTime();
    if (!datesValid) throw new Error("Rights start and end dates are invalid.");
    const saved = await sql<{ id: string }>`
      insert into bridge_title_owner_submissions (
        id, title_id, owner_user_id, owner_organization_id, details,
        submission_status, submitted_at, submitted_by, updated_by
      ) values (
        ${randomBytes(16).toString("hex")}, ${title.id}, ${actor.userId}, ${actor.accountType === "studio" ? actor.organizationId : null},
        ${JSON.stringify(data.details)}::jsonb, 'SUBMITTED', now(), ${actor.userId}, ${actor.userId}
      )
      on conflict (title_id) do update set
        details = excluded.details, submission_status = 'SUBMITTED',
        submitted_at = now(), submitted_by = excluded.submitted_by,
        updated_by = excluded.updated_by, updated_at = now()
      where bridge_title_owner_submissions.owner_user_id = excluded.owner_user_id
        and bridge_title_owner_submissions.owner_organization_id is not distinct from excluded.owner_organization_id
        and bridge_title_owner_submissions.submission_status in ('DRAFT', 'NEEDS_CORRECTION')
      returning id
    `;
    if (!saved.length) throw new Error("The rights package is already submitted or is owned by another account.");
    await writeAudit({
      actorUserId: actor.userId,
      action: "owner.rights_package_submitted",
      entityType: "bridge_title_owner_submission",
      entityId: title.id,
      metadata: { titleId: title.id, status: title.status, legalReviewRequired: true },
    });
    return { submitted: true, titleStatusUnchanged: true };
  });

export const getTitleOwnerRightsReviewHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const { actor, title } = await requireTitleOwner(context.userId, data.titleId);
    const sql = await getSql();
    const rows = await sql<{ action: string; metadata: string; created_at: string }>`
      select action, metadata, created_at
      from bridge_audit_logs
      where entity_type = 'bridge_title_owner_submission'
        and entity_id = ${title.id}
        and actor_user_id <> ${actor.userId}
      order by created_at desc
      limit 50
    `;
    const submission = await sql<{ submission_status: string; submitted_at: string | null; details: Record<string, unknown> }>`
      select submission_status, submitted_at, details
      from bridge_title_owner_submissions
      where title_id = ${title.id}
        and owner_user_id = ${actor.userId}
        and owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
      limit 1
    `;
    return { reviewEvents: rows, submission: submission[0] ?? null };
  });

export const getTitleOwnerRightsDraft = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const { actor, title } = await requireTitleOwner(context.userId, data.titleId);
    const sql = await getSql();
    const rows = await sql<{ details: Record<string, unknown>; submission_status: string; submitted_at: string | null }>`
      select details, submission_status, submitted_at
      from bridge_title_owner_submissions
      where title_id = ${title.id} and owner_user_id = ${actor.userId}
        and owner_organization_id is not distinct from ${actor.accountType === "studio" ? actor.organizationId : null}
      limit 1
    `;
    return { submission: rows[0] ?? null };
  });
