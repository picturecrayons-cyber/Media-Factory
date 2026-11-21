import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { canReadTitle, canOperateOnTitle } from "./rbac";
import { writeAudit } from "./audit";
import { sameOwner } from "./creator-document-policy";

const DOCUMENT_TYPES = [
  "FINISHED_FILM_AGREEMENT",
  "STORY_CONCEPT_AGREEMENT",
  "DISTRIBUTION_AGREEMENT",
  "OWNERSHIP_CHAIN_OF_TITLE",
  "AUTHOR_ASSIGNMENT",
  "MUSIC_RIGHTS",
  "OTHER",
] as const;

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MIME_TYPES = new Set(["application/pdf"]);

function assertCreatorOrStudio(actor: { accountType: string }) {
  if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") {
    throw new Error("Creator or Studio account required");
  }
}

export const requestCreatorDocumentUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    documentType: z.enum(DOCUMENT_TYPES),
    fileName: z.string().trim().min(1).max(160),
    contentType: z.string().refine((v) => MIME_TYPES.has(v), "Only PDF agreements are accepted"),
    byteSize: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorOrStudio(actor);
    if (actor.accountType === "studio" && !actor.organizationId) {
      throw new Error("A verified Studio organization mapping is required before uploading reusable organization documents");
    }
    const id = randomBytes(16).toString("hex");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100);
    const key = `bridge-private/creator-documents/${actor.userId}/${id}/${safeName}`;
    const { signUpload } = await import("./oci-object-storage.server");
    const signed = await signUpload({ key, contentType: data.contentType, expiresIn: 900 });
    const sql = await getSql();
    await sql`
      insert into bridge_creator_documents
        (id,owner_user_id,owner_account_type,owner_organization_id,document_type,file_name,
         content_type,byte_size,storage_key,status,created_by)
      values
        (${id},${actor.userId},${actor.accountType},${actor.accountType === "studio" ? actor.organizationId ?? null : null},
         ${data.documentType},${data.fileName},${data.contentType},${data.byteSize},${key},'PENDING_UPLOAD',${actor.userId})
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "creator_document.upload_requested",
      entityType: "bridge_creator_document",
      entityId: id,
      metadata: { documentType: data.documentType, byteSize: data.byteSize },
    });
    return { documentId: id, uploadUrl: signed.url, method: "PUT" as const, expiresIn: 900 };
  });

export const confirmCreatorDocumentUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(16) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorOrStudio(actor);
    const sql = await getSql();
    const rows = await sql<{
      id: string; owner_user_id: string; owner_account_type: string;
      owner_organization_id: string | null; storage_key: string;
      content_type: string; byte_size: number; status: string;
    }>`
      select id,owner_user_id,owner_account_type,owner_organization_id,storage_key,
             content_type,byte_size,status
      from bridge_creator_documents where id=${data.documentId} for update
    `;
    const doc = rows[0];
    if (!doc || !sameOwner(actor, doc)) throw new Error("Document not found");
    if (doc.status === "VERIFIED") return { documentId: doc.id, verified: true as const };
    if (doc.status !== "PENDING_UPLOAD") throw new Error("Document upload is no longer active");
    const { verifyObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    const uploaded = await verifyObject(doc.storage_key, doc.content_type);
    if (uploaded.byteSize !== Number(doc.byte_size)) throw new Error("Uploaded document size mismatch");
    if (!uploaded.etag) throw new Error("Uploaded document integrity metadata is missing");
    const sealedKey = `${doc.storage_key}.verified/${doc.id}`;
    const sealed = await sealVerifiedObject(doc.storage_key, sealedKey, uploaded.etag);
    if (sealed.byteSize !== Number(doc.byte_size)) throw new Error("Verified document copy size mismatch");
    await sql`
      update bridge_creator_documents
      set storage_key=${sealedKey},status='VERIFIED',verified_at=now(),updated_at=now()
      where id=${doc.id} and status='PENDING_UPLOAD'
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "creator_document.upload_verified",
      entityType: "bridge_creator_document",
      entityId: doc.id,
      metadata: { byteSize: sealed.byteSize },
    });
    return { documentId: doc.id, verified: true as const };
  });

export const listCreatorDocuments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorOrStudio(actor);
    const sql = await getSql();
    try {
      const rows = await sql<{
        id: string; document_type: string; file_name: string; content_type: string;
        byte_size: number | null; status: string; verified_at: string | Date | null;
        created_at: string | Date;
      }>`
        select id,document_type,file_name,content_type,byte_size,status,verified_at,created_at
        from bridge_creator_documents
        where status <> 'REVOKED'
          and (
            (owner_account_type='independent_creator' and owner_user_id=${actor.userId})
            or (owner_account_type='studio' and owner_organization_id=${actor.organizationId ?? null}
                and ${actor.accountType}='studio' and ${actor.organizationId ?? null} is not null
                and exists (
                  select 1 from bridge_organization_memberships m
                  join bridge_organizations o on o.id=m.organization_id
                  where m.organization_id=bridge_creator_documents.owner_organization_id
                    and m.user_id=${actor.userId} and m.status='active' and o.status='active'
                ))
          )
        order by created_at desc limit 200
      `;
      return { documents: rows };
    } catch (error) {
      const reference = randomBytes(6).toString("hex");
      const diagnostic = error as { code?: string; name?: string };
      console.error("[bridge-document-vault] list failed", {
        reference,
        errorName: diagnostic?.name ?? "UnknownError",
        databaseCode: diagnostic?.code ?? "unavailable",
      });
      throw new Error(`Document Vault is temporarily unavailable. Retry the request. Reference: ${reference}`);
    }
  });

export const linkCreatorDocumentToTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    documentId: z.string().min(16),
    evidenceType: z.enum(DOCUMENT_TYPES),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorOrStudio(actor);
    const title = await loadTitle(data.titleId);
    if (!title || !canOperateOnTitle(actor, title, "title.update_own", "title.license")) {
      throw new Error("Title not found");
    }
    const sql = await getSql();
    const docs = await sql<{
      id: string; owner_user_id: string; owner_account_type: string;
      owner_organization_id: string | null; document_type: string; status: string;
    }>`
      select id,owner_user_id,owner_account_type,owner_organization_id,document_type,status
      from bridge_creator_documents where id=${data.documentId} limit 1
    `;
    const doc = docs[0];
    if (!doc || doc.status !== "VERIFIED" || !sameOwner(actor, doc)) {
      throw new Error("Select a verified document from your own Creator account or Studio organization");
    }
    if (doc.document_type !== data.evidenceType) {
      throw new Error("Evidence type must match the uploaded document type");
    }
    const linkId = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_title_document_links(id,title_id,document_id,evidence_type,linked_by)
      values (${linkId},${title.id},${doc.id},${data.evidenceType},${actor.userId})
      on conflict (title_id,document_id,evidence_type) do nothing
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "creator_document.linked_to_title",
      entityType: "bridge_title",
      entityId: title.id,
      metadata: { documentId: doc.id, evidenceType: data.evidenceType },
    });
    return { linked: true as const, documentId: doc.id };
  });

export const listTitleDocumentEvidence = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const sql = await getSql();
    const rows = await sql<{
      id: string; document_id: string; evidence_type: string; file_name: string;
      document_type: string; status: string; byte_size: number | null; created_at: string | Date;
    }>`
      select l.id,l.document_id,l.evidence_type,d.file_name,d.document_type,d.status,d.byte_size,l.created_at
      from bridge_title_document_links l
      join bridge_creator_documents d on d.id=l.document_id
      where l.title_id=${title.id} and d.status='VERIFIED'
      order by l.created_at desc
    `;
    return { evidence: rows.map((row) => ({ ...row, byteSize: Number(row.byte_size ?? 0) })) };
  });

export const requestCreatorDocumentDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(16) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string; owner_user_id: string; owner_account_type: string;
      owner_organization_id: string | null; storage_key: string; status: string;
    }>`
      select id,owner_user_id,owner_account_type,owner_organization_id,storage_key,status
      from bridge_creator_documents where id=${data.documentId} limit 1
    `;
    const doc = rows[0];
    if (!doc || doc.status !== "VERIFIED") throw new Error("Document not found");
    const ownerAccess = sameOwner(actor, doc);
    const titleAccess = await sql<{ allowed: boolean }>`
      select exists (
        select 1 from bridge_title_document_links l
        join bridge_titles t on t.id=l.title_id
        where l.document_id=${doc.id}
          and (t.owner_user_id=${actor.userId}
            or (t.owner_account_type='studio' and t.owner_organization_id=${actor.organizationId ?? null}
                and ${actor.accountType}='studio' and ${actor.organizationId ?? null} is not null))
      ) as allowed
    `;
    if (!ownerAccess && !titleAccess[0]?.allowed && actor.internalRole !== "super_admin" && actor.internalRole !== "legal_reviewer") {
      throw new Error("Forbidden");
    }
    const { signDownload } = await import("./oci-object-storage.server");
    const signed = await signDownload({ key: doc.storage_key, expiresIn: 180 });
    await writeAudit({
      actorUserId: actor.userId,
      action: "creator_document.download_signed",
      entityType: "bridge_creator_document",
      entityId: doc.id,
    });
    return { url: signed.url, expiresIn: 180 };
  });
