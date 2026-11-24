import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, canOperateOnTitle, canReadTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

const documentType = z.enum([
  "FINISHED_FILM_AGREEMENT",
  "STORY_CONCEPT_AGREEMENT",
  "DISTRIBUTION_AGREEMENT",
  "OWNERSHIP_CHAIN_OF_TITLE",
  "AUTHOR_ASSIGNMENT",
  "MUSIC_RIGHTS",
  "OTHER",
]);
const evidenceType = documentType;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 25 * 1024 * 1024;

function requireOwnerAccount(actor: { accountType: string; internalRole?: string | null }) {
  if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
    throw new Error("Creator or Studio account required");
  }
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100) || "document";
}

export const listMyCreatorDocuments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireOwnerAccount(actor);
    const sql = await getSql();
    const rows = await sql<{
      id: string; document_type: string; file_name: string; content_type: string;
      byte_size: number | null; status: string; created_at: string | Date; verified_at: string | Date | null;
    }>`
      select id, document_type, file_name, content_type, byte_size, status, created_at, verified_at
      from bridge_creator_documents
      where owner_user_id = ${actor.userId}
         or (
           ${actor.accountType === "studio"} and owner_account_type = 'studio'
           and owner_organization_id = ${actor.organizationId ?? null}
           and ${actor.organizationId ?? null} is not null
         )
      order by created_at desc limit 100
    `;
    return { documents: rows.map((row) => ({
      ...row,
      byte_size: row.byte_size == null ? null : Number(row.byte_size),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      verified_at: row.verified_at instanceof Date ? row.verified_at.toISOString() : row.verified_at,
    })) };
  });

export const requestCreatorDocumentUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    documentType,
    fileName: z.string().trim().min(1).max(160),
    contentType: z.string().min(3).max(120),
    byteSize: z.number().int().positive().max(MAX_BYTES),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireOwnerAccount(actor);
    assertPermission(actor, "title.create");
    if (actor.accountType === "studio" && !actor.organizationId) {
      throw new Error("Verified Studio organization membership is required");
    }
    if (!allowedTypes.has(data.contentType)) throw new Error("Use a PDF, JPG or PNG document");
    const id = randomBytes(16).toString("hex");
    const key = `bridge-documents/${actor.userId}/${id}/${safeFileName(data.fileName)}`;
    const { signUpload } = await import("./oci-object-storage.server");
    const signed = await signUpload({ key, contentType: data.contentType, expiresIn: 900 });
    const sql = await getSql();
    await sql`
      insert into bridge_creator_documents (
        id, owner_user_id, owner_account_type, owner_organization_id, document_type,
        file_name, content_type, byte_size, storage_key, status, created_by
      ) values (
        ${id}, ${actor.userId}, ${actor.accountType},
        ${actor.accountType === "studio" ? actor.organizationId : null},
        ${data.documentType}, ${safeFileName(data.fileName)}, ${data.contentType},
        ${data.byteSize}, ${key}, 'PENDING_UPLOAD', ${actor.userId}
      )
    `;
    await writeAudit({
      actorUserId: actor.userId, action: "creator_document.upload_requested",
      entityType: "bridge_creator_document", entityId: id,
      metadata: { documentType: data.documentType, byteSize: data.byteSize },
    });
    return { documentId: id, ...signed, expiresIn: 900 };
  });

export const confirmCreatorDocumentUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(8), expectedByteSize: z.number().int().positive().max(MAX_BYTES) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireOwnerAccount(actor);
    const sql = await getSql();
    const rows = await sql<{
      id: string; storage_key: string; content_type: string; byte_size: number;
    }>`
      select id, storage_key, content_type, byte_size
      from bridge_creator_documents
      where id = ${data.documentId} and status = 'PENDING_UPLOAD'
        and (
          owner_user_id = ${actor.userId}
          or (owner_account_type = 'studio' and owner_organization_id = ${actor.organizationId ?? null}
              and ${actor.organizationId ?? null} is not null)
        )
      limit 1
    `;
    const document = rows[0];
    if (!document) throw new Error("Document upload not found or already closed");
    if (Number(document.byte_size) !== data.expectedByteSize) throw new Error("Document size does not match the requested upload");
    const { verifyObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    const object = await verifyObject(document.storage_key, document.content_type);
    if (object.byteSize !== data.expectedByteSize || !object.etag) throw new Error("Stored document verification failed");
    const sealedKey = `${document.storage_key}.verified/${document.id}`;
    const sealed = await sealVerifiedObject(document.storage_key, sealedKey, object.etag);
    if (sealed.byteSize !== data.expectedByteSize || !sealed.etag) throw new Error("Immutable document verification failed");
    const updated = await sql`
      update bridge_creator_documents
      set storage_key = ${sealedKey}, status = 'VERIFIED', verified_at = now(), updated_at = now()
      where id = ${document.id} and status = 'PENDING_UPLOAD' and storage_key = ${document.storage_key}
      returning id
    `;
    if (!updated.length) throw new Error("Document state changed; refresh the Vault before retrying");
    await writeAudit({
      actorUserId: actor.userId, action: "creator_document.upload_verified",
      entityType: "bridge_creator_document", entityId: document.id,
      metadata: { byteSize: sealed.byteSize, contentType: document.content_type },
    });
    return { documentId: document.id, status: "VERIFIED" as const, byteSize: sealed.byteSize };
  });

export const attachCreatorDocumentToTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    documentId: z.string().min(8),
    titleId: z.string().min(8),
    evidenceType,
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireOwnerAccount(actor);
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title) || !canOperateOnTitle(actor, title, "title.update_own", "title.update_own")) {
      throw new Error("Title not found or not editable by this account");
    }
    const sql = await getSql();
    const documents = await sql<{ id: string; document_type: string }>`
      select id, document_type from bridge_creator_documents
      where id = ${data.documentId} and status = 'VERIFIED'
        and (
          owner_user_id = ${actor.userId}
          or (owner_account_type = 'studio' and owner_organization_id = ${actor.organizationId ?? null}
              and ${actor.organizationId ?? null} is not null)
        )
      limit 1
    `;
    const document = documents[0];
    if (!document) throw new Error("Verified document not found in your private Vault");
    if (document.document_type !== data.evidenceType && document.document_type !== "OTHER") {
      throw new Error("Selected evidence type does not match this document");
    }
    const existing = await sql`
      select id from bridge_title_document_links
      where title_id = ${title.id} and document_id = ${document.id} and evidence_type = ${data.evidenceType}
      limit 1
    `;
    if (!existing.length) {
      await sql`
        insert into bridge_title_document_links (id, title_id, document_id, evidence_type, linked_by)
        values (${randomBytes(16).toString("hex")}, ${title.id}, ${document.id}, ${data.evidenceType}, ${actor.userId})
      `;
    }
    await writeAudit({
      actorUserId: actor.userId, action: "creator_document.attached_to_title",
      entityType: "bridge_title_document_link", entityId: document.id,
      metadata: { titleId: title.id, evidenceType: data.evidenceType },
    });
    return { attached: true, titleId: title.id, documentId: document.id };
  });

export const requestCreatorDocumentDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireOwnerAccount(actor);
    const sql = await getSql();
    const rows = await sql<{ id: string; storage_key: string }>`
      select id, storage_key from bridge_creator_documents
      where id = ${data.documentId} and status = 'VERIFIED'
        and (
          owner_user_id = ${actor.userId}
          or (owner_account_type = 'studio' and owner_organization_id = ${actor.organizationId ?? null}
              and ${actor.organizationId ?? null} is not null)
        )
      limit 1
    `;
    if (!rows[0]) throw new Error("Document not found");
    const { signDownload } = await import("./oci-object-storage.server");
    const signed = await signDownload({ key: rows[0].storage_key, expiresIn: 300 });
    await writeAudit({
      actorUserId: actor.userId, action: "creator_document.download_signed",
      entityType: "bridge_creator_document", entityId: rows[0].id,
    });
    return signed;
  });
