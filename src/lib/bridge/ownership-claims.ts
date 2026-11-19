import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

const EVIDENCE_CATEGORIES = [
  "SIGNED_OWNERSHIP_DECLARATION",
  "CHAIN_OF_TITLE",
  "NEGATIVE_RIGHTS_CERTIFICATE",
  "CBFC_CERTIFICATE",
  "PRODUCER_ASSOCIATION_CERTIFICATE",
  "PRIOR_ASSIGNMENT",
  "EXCLUDED_RIGHTS_SCHEDULE",
  "AUTHORIZATION_LETTER",
  "OTHER",
] as const;

const CLAIMANT_CAPACITIES = [
  "PRODUCER",
  "PROPRIETOR",
  "AUTHORIZED_REPRESENTATIVE",
  "RIGHTS_SUCCESSOR",
  "OTHER",
] as const;

const CLAIM_BASES = [
  "SOLE_NEGATIVE_RIGHTS",
  "RIGHTS_OWNER",
  "CHAIN_OF_TITLE",
  "AUTHORIZATION",
  "OTHER",
] as const;

const ALLOWED_EVIDENCE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_EVIDENCE_BYTES = 40 * 1024 * 1024;

type ClaimStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "NEEDS_INFORMATION"
  | "REFERRED_TO_LEGAL"
  | "CLOSED_INTAKE"
  | "LEGAL_REVIEWED";

type ClaimRow = {
  id: string;
  title_id: string;
  claimant_user_id: string;
  current_owner_user_id_snapshot: string;
  producer_entity_name: string;
  claimant_capacity: string;
  claim_basis: string;
  status: ClaimStatus;
  legal_decision: "SUPPORTED" | "NOT_SUPPORTED" | null;
  created_at: string | Date;
  updated_at: string | Date;
  title_name?: string;
  title_status?: string;
  declaration_text?: string;
  claimant_display_name?: string | null;
};

function safeFileName(value: string): string {
  const cleaned = value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 80);
  return cleaned || "evidence";
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function assertCreatorClaimant(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (!actor.emailVerified || actor.accountType !== "independent_creator" || actor.internalRole !== null) {
    throw new Error("Only a verified independent Creator account can submit an ownership claim.");
  }
}

function assertSuperAdmin(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (!actor.emailVerified || actor.internalRole !== "super_admin") {
    throw new Error("Verified Super Admin access required.");
  }
}

function assertLegalReviewer(actor: Awaited<ReturnType<typeof requireVerifiedActor>>) {
  if (!actor.emailVerified || actor.internalRole !== "legal_reviewer") {
    throw new Error("Verified Legal Reviewer access required.");
  }
}

async function insertClaimEvent(
  sql: Awaited<ReturnType<typeof getSql>>,
  claimId: string,
  actorUserId: string,
  action: string,
  note?: string,
  metadata: Record<string, unknown> = {},
) {
  await sql`
    insert into bridge_title_ownership_claim_events
      (claim_id, actor_user_id, action, note, metadata)
    values
      (${claimId}, ${actorUserId}, ${action}, ${note ?? null}, ${JSON.stringify(metadata)})
  `;
}

export const createOwnershipClaim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8).max(128),
    producerEntityName: z.string().trim().min(2).max(200),
    claimantCapacity: z.enum(CLAIMANT_CAPACITIES),
    claimBasis: z.enum(CLAIM_BASES),
    declarationText: z.string().trim().min(80).max(5000),
    attested: z.literal(true),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorClaimant(actor);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found.");
    if (title.ownerUserId === actor.userId) {
      throw new Error("This title is already recorded under your account. Use its existing title workspace.");
    }
    const producerCreditMatches = (Array.isArray(title.credits) ? title.credits : []).some((credit) =>
      String(credit.role || "").trim().toLowerCase() === "producer" &&
      String(credit.name || "").toLowerCase().includes(data.producerEntityName.toLowerCase()),
    );
    if (!producerCreditMatches) {
      throw new Error("The named producer or business entity is not present in this title's Producer credits. A claim cannot be created from a title-name guess alone.");
    }
    const sql = await getSql();
    const existing = await sql<{ id: string }>`
      select id from bridge_title_ownership_claims
      where title_id = ${title.id}
        and claimant_user_id = ${actor.userId}
        and status in ('DRAFT','SUBMITTED','NEEDS_INFORMATION','REFERRED_TO_LEGAL')
      limit 1
    `;
    if (existing[0]) {
      return { claimId: existing[0].id, alreadyExists: true as const };
    }
    const rows = await sql<{ id: string }>`
      insert into bridge_title_ownership_claims (
        title_id, claimant_user_id, claimant_account_type,
        current_owner_user_id_snapshot, producer_entity_name,
        claimant_capacity, claim_basis, declaration_text, attested_at, status
      ) values (
        ${title.id}, ${actor.userId}, 'independent_creator',
        ${title.ownerUserId}, ${data.producerEntityName},
        ${data.claimantCapacity}, ${data.claimBasis},
        ${data.declarationText}, now(), 'DRAFT'
      )
      returning id
    `;
    const claimId = rows[0]?.id;
    if (!claimId) throw new Error("Could not create the ownership claim.");
    await insertClaimEvent(sql, claimId, actor.userId, "CLAIM_CREATED", undefined, {
      titleId: title.id,
      recordedOwnerUnchanged: true,
    });
    await writeAudit({
      actorUserId: actor.userId,
      action: "title.ownership_claim_created",
      entityType: "bridge_title_ownership_claim",
      entityId: claimId,
      metadata: { titleId: title.id },
    });
    return { claimId, alreadyExists: false as const };
  });

export const requestOwnershipClaimEvidenceUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    claimId: z.string().uuid(),
    category: z.enum(EVIDENCE_CATEGORIES),
    fileName: z.string().trim().min(1).max(120),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    byteSize: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorClaimant(actor);
    if (!ALLOWED_EVIDENCE_TYPES.has(data.contentType)) throw new Error("Unsupported evidence file type.");
    const sql = await getSql();
    const claims = await sql<{ id: string; status: ClaimStatus }>`
      select id, status from bridge_title_ownership_claims
      where id = ${data.claimId} and claimant_user_id = ${actor.userId}
      limit 1
    `;
    const claim = claims[0];
    if (!claim || !["DRAFT", "NEEDS_INFORMATION"].includes(claim.status)) {
      throw new Error("Evidence upload is not available for this claim.");
    }
    const evidenceId = randomUUID();
    const key = `bridge/ownership-claims/${data.claimId}/${evidenceId}-${safeFileName(data.fileName)}`;
    const { signUpload } = await import("./oci-object-storage.server");
    const signed = await signUpload({
      key,
      contentType: data.contentType,
      expiresIn: 900,
    });
    await sql`
      insert into bridge_title_ownership_claim_evidence (
        id, claim_id, category, file_name, content_type, byte_size,
        object_key, uploaded_by, status
      ) values (
        ${evidenceId}, ${data.claimId}, ${data.category}, ${safeFileName(data.fileName)},
        ${data.contentType}, ${data.byteSize}, ${key}, ${actor.userId}, 'PENDING_UPLOAD'
      )
    `;
    await insertClaimEvent(sql, data.claimId, actor.userId, "EVIDENCE_UPLOAD_REQUESTED", undefined, {
      evidenceId,
      category: data.category,
    });
    return {
      evidenceId,
      uploadUrl: signed.url,
      method: "PUT" as const,
      expiresInSeconds: 900,
      requiredHeader: { "Content-Type": data.contentType },
    };
  });

export const confirmOwnershipClaimEvidenceUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    claimId: z.string().uuid(),
    evidenceId: z.string().min(8).max(64),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorClaimant(actor);
    const sql = await getSql();
    const rows = await sql<{
      id: string; claim_id: string; object_key: string;
      content_type: string; byte_size: number; status: string; claim_status: ClaimStatus;
    }>`
      select e.id, e.claim_id, e.object_key, e.content_type, e.byte_size, e.status,
        c.status as claim_status
      from bridge_title_ownership_claim_evidence e
      join bridge_title_ownership_claims c on c.id = e.claim_id
      where e.id = ${data.evidenceId}
        and e.claim_id = ${data.claimId}
        and c.claimant_user_id = ${actor.userId}
      limit 1
    `;
    const evidence = rows[0];
    if (!evidence || !["DRAFT", "NEEDS_INFORMATION"].includes(evidence.claim_status)) {
      throw new Error("Evidence confirmation is closed for this claim.");
    }
    if (evidence.status === "VERIFIED") return { evidenceId: evidence.id, verified: true as const };
    if (evidence.status !== "PENDING_UPLOAD") throw new Error("Evidence is not awaiting upload confirmation.");
    const { verifyObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    const source = await verifyObject(evidence.object_key, evidence.content_type);
    if (source.byteSize !== Number(evidence.byte_size) || !source.etag) {
      throw new Error("Evidence object size or ETag does not match the submitted file.");
    }
    const sealedKey = `${evidence.object_key}.verified/${evidence.id}`;
    const sealed = await sealVerifiedObject(evidence.object_key, sealedKey, source.etag);
    if (sealed.byteSize !== source.byteSize || !sealed.etag || sealed.contentType !== evidence.content_type) {
      throw new Error("Sealed evidence object does not match the uploaded document.");
    }
    const persisted = await sql<{ id: string }>`
      update bridge_title_ownership_claim_evidence e
      set object_key = ${sealedKey}, object_etag = ${sealed.etag},
          status = 'VERIFIED', verified_at = now()
      where e.id = ${evidence.id}
        and e.status = 'PENDING_UPLOAD'
        and exists (
          select 1 from bridge_title_ownership_claims c
          where c.id = e.claim_id and c.status in ('DRAFT','NEEDS_INFORMATION')
        )
      returning e.id
    `;
    if (!persisted[0]) throw new Error("The claim was closed while this upload was being verified.");
    await insertClaimEvent(sql, data.claimId, actor.userId, "EVIDENCE_VERIFIED", undefined, {
      evidenceId: evidence.id,
      byteSize: sealed.byteSize,
    });
    await writeAudit({
      actorUserId: actor.userId,
      action: "title.ownership_claim_evidence_verified",
      entityType: "bridge_title_ownership_claim_evidence",
      entityId: evidence.id,
      metadata: { claimId: data.claimId },
    });
    return { evidenceId: evidence.id, verified: true as const };
  });

export const submitOwnershipClaim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ claimId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorClaimant(actor);
    const sql = await getSql();
    const claims = await sql<{
      id: string; status: ClaimStatus; title_id: string;
      current_owner_user_id_snapshot: string;
    }>`
      select id, status, title_id, current_owner_user_id_snapshot
      from bridge_title_ownership_claims
      where id = ${data.claimId} and claimant_user_id = ${actor.userId}
      limit 1
    `;
    const claim = claims[0];
    if (!claim || !["DRAFT", "NEEDS_INFORMATION"].includes(claim.status)) {
      throw new Error("This claim cannot be submitted in its current state.");
    }
    const currentTitle = await loadTitle(claim.title_id);
    if (!currentTitle || currentTitle.ownerUserId !== claim.current_owner_user_id_snapshot) {
      throw new Error("The recorded title owner changed while this claim was being prepared. Stop submission and reconcile the title record.");
    }
    const evidence = await sql<{ category: string; count: number }>`
      select category, count(*)::int as count
      from bridge_title_ownership_claim_evidence
      where claim_id = ${data.claimId} and status = 'VERIFIED'
      group by category
    `;
    const categories = new Set(evidence.filter((item) => item.count > 0).map((item) => item.category));
    if (!categories.has("SIGNED_OWNERSHIP_DECLARATION")) {
      throw new Error("A signed ownership declaration is required.");
    }
    if (!["CHAIN_OF_TITLE", "NEGATIVE_RIGHTS_CERTIFICATE", "PRIOR_ASSIGNMENT", "AUTHORIZATION_LETTER"].some((category) => categories.has(category))) {
      throw new Error("Add at least one chain-of-title, negative-rights or authorization document.");
    }
    await sql`
      update bridge_title_ownership_claims
      set status = 'SUBMITTED', updated_at = now()
      where id = ${data.claimId} and claimant_user_id = ${actor.userId}
    `;
    await insertClaimEvent(sql, data.claimId, actor.userId, "CLAIM_SUBMITTED");
    await writeAudit({
      actorUserId: actor.userId,
      action: "title.ownership_claim_submitted",
      entityType: "bridge_title_ownership_claim",
      entityId: data.claimId,
      metadata: { titleOwnershipChanged: false, assetAttributionChanged: false },
    });
    return { submitted: true as const, titleOwnershipChanged: false as const };
  });

export const listMyOwnershipClaims = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorClaimant(actor);
    const sql = await getSql();
    const claims = await sql<ClaimRow>`
      select c.id, c.title_id, c.claimant_user_id, c.current_owner_user_id_snapshot,
        c.producer_entity_name, c.claimant_capacity, c.claim_basis, c.status,
        c.legal_decision, c.created_at, c.updated_at, t.name as title_name, t.status as title_status
      from bridge_title_ownership_claims c
      join bridge_titles t on t.id = c.title_id
      where c.claimant_user_id = ${actor.userId}
      order by c.created_at desc
      limit 100
    `;
    const result = [];
    for (const claim of claims) {
      const evidence = await sql<{ id: string; category: string; file_name: string; status: string; byte_size: number }>`
        select id, category, file_name, status, byte_size
        from bridge_title_ownership_claim_evidence
        where claim_id = ${claim.id}
        order by created_at
      `;
      result.push({
        id: claim.id,
        titleId: claim.title_id,
        titleName: claim.title_name,
        titleStatus: claim.title_status,
        producerEntityName: claim.producer_entity_name,
        claimantCapacity: claim.claimant_capacity,
        claimBasis: claim.claim_basis,
        status: claim.status,
        legalDecision: claim.legal_decision,
        createdAt: iso(claim.created_at),
        evidence: evidence.map((item) => ({
          id: item.id,
          category: item.category,
          fileName: item.file_name,
          status: item.status,
          byteSize: Number(item.byte_size),
        })),
      });
    }
    return { claims: result };
  });

export const listOwnershipClaimsForReview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin" && actor.internalRole !== "legal_reviewer") {
      throw new Error("Ownership evidence review access required.");
    }
    const sql = await getSql();
    const claims = await sql<ClaimRow>`
      select c.id, c.title_id, c.claimant_user_id, c.current_owner_user_id_snapshot,
        c.producer_entity_name, c.claimant_capacity, c.claim_basis, c.declaration_text, c.status,
        c.legal_decision, c.created_at, c.updated_at,
        t.name as title_name, t.status as title_status,
        p.display_name as claimant_display_name
      from bridge_title_ownership_claims c
      join bridge_titles t on t.id = c.title_id
      left join bridge_profiles p on p.user_id = c.claimant_user_id
      where (
        (${actor.internalRole === "super_admin"} and c.status in ('SUBMITTED','NEEDS_INFORMATION','REFERRED_TO_LEGAL','LEGAL_REVIEWED','CLOSED_INTAKE'))
        or
        (${actor.internalRole === "legal_reviewer"} and c.status = 'REFERRED_TO_LEGAL')
      )
      order by c.created_at asc
      limit 100
    `;
    const result = [];
    for (const claim of claims) {
      const evidence = await sql<{ id: string; category: string; file_name: string; content_type: string; status: string; byte_size: number }>`
        select id, category, file_name, content_type, status, byte_size
        from bridge_title_ownership_claim_evidence
        where claim_id = ${claim.id}
        order by created_at
      `;
      result.push({
        id: claim.id,
        titleId: claim.title_id,
        titleName: claim.title_name,
        titleStatus: claim.title_status,
        claimantDisplayName: claim.claimant_display_name,
        declarationText: claim.declaration_text,
        ownerMismatch: claim.current_owner_user_id_snapshot !== claim.claimant_user_id,
        producerEntityName: claim.producer_entity_name,
        claimantCapacity: claim.claimant_capacity,
        claimBasis: claim.claim_basis,
        status: claim.status,
        legalDecision: claim.legal_decision,
        createdAt: iso(claim.created_at),
        evidence: evidence.map((item) => ({
          id: item.id,
          category: item.category,
          fileName: item.file_name,
          contentType: item.content_type,
          status: item.status,
          byteSize: Number(item.byte_size),
        })),
      });
    }
    return { claims: result };
  });

export const requestOwnershipClaimEvidenceDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ claimId: z.string().uuid(), evidenceId: z.string().min(8).max(64) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; claim_id: string; claimant_user_id: string; object_key: string; status: string }>`
      select e.id, e.claim_id, c.claimant_user_id, e.object_key, e.status
      from bridge_title_ownership_claim_evidence e
      join bridge_title_ownership_claims c on c.id = e.claim_id
      where e.id = ${data.evidenceId} and e.claim_id = ${data.claimId}
      limit 1
    `;
    const evidence = rows[0];
    if (!evidence || evidence.status !== "VERIFIED") throw new Error("Evidence not found.");
    const claimant = evidence.claimant_user_id === actor.userId &&
      actor.accountType === "independent_creator" &&
      actor.internalRole === null;
    const reviewer = actor.internalRole === "super_admin" || actor.internalRole === "legal_reviewer";
    if (!claimant && !reviewer) throw new Error("Not found.");
    const { signDownload } = await import("./oci-object-storage.server");
    const signed = await signDownload({ key: evidence.object_key, expiresIn: 300 });
    await writeAudit({
      actorUserId: actor.userId,
      action: "title.ownership_claim_evidence_download_signed",
      entityType: "bridge_title_ownership_claim_evidence",
      entityId: evidence.id,
      metadata: { claimId: data.claimId, expiresInSeconds: 300 },
    });
    return { url: signed.url, expiresInSeconds: 300 };
  });

export const triageOwnershipClaim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    claimId: z.string().uuid(),
    decision: z.enum(["NEEDS_INFORMATION","REFERRED_TO_LEGAL","CLOSED_INTAKE"]),
    note: z.string().trim().min(5).max(1200),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertSuperAdmin(actor);
    const sql = await getSql();
    const candidates = await sql<{ title_id: string; current_owner_user_id_snapshot: string; status: ClaimStatus }>`
      select title_id, current_owner_user_id_snapshot, status
      from bridge_title_ownership_claims
      where id = ${data.claimId}
      limit 1
    `;
    const candidate = candidates[0];
    if (!candidate || !["SUBMITTED", "NEEDS_INFORMATION"].includes(candidate.status)) {
      throw new Error("Claim is no longer available for intake review.");
    }
    const currentTitle = await loadTitle(candidate.title_id);
    if (!currentTitle || currentTitle.ownerUserId !== candidate.current_owner_user_id_snapshot) {
      throw new Error("The recorded title owner changed since this claim was filed. Stop review and reconcile the newer owner record.");
    }
    const updated = await sql<{ id: string }>`
      update bridge_title_ownership_claims
      set status = ${data.decision}, intake_reviewed_by = ${actor.userId},
          intake_reviewed_at = now(), intake_review_note = ${data.note},
          updated_at = now()
      where id = ${data.claimId} and status in ('SUBMITTED','NEEDS_INFORMATION')
        and current_owner_user_id_snapshot = ${candidate.current_owner_user_id_snapshot}
      returning id
    `;
    if (!updated[0]) throw new Error("Claim is no longer available for intake review.");
    const action = data.decision === "NEEDS_INFORMATION"
      ? "INTAKE_NEEDS_INFORMATION"
      : data.decision === "REFERRED_TO_LEGAL"
        ? "REFERRED_TO_LEGAL"
        : "INTAKE_CLOSED";
    await insertClaimEvent(sql, data.claimId, actor.userId, action, data.note);
    await writeAudit({
      actorUserId: actor.userId,
      action: "title.ownership_claim_triaged",
      entityType: "bridge_title_ownership_claim",
      entityId: data.claimId,
      metadata: { decision: data.decision, titleOwnershipChanged: false },
    });
    return { reviewed: true as const, titleOwnershipChanged: false as const };
  });

export const recordOwnershipLegalReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    claimId: z.string().uuid(),
    decision: z.enum(["SUPPORTED","NOT_SUPPORTED","NEEDS_MORE_EVIDENCE"]),
    note: z.string().trim().min(10).max(2000),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertLegalReviewer(actor);
    const sql = await getSql();
    const nextStatus: ClaimStatus = data.decision === "NEEDS_MORE_EVIDENCE"
      ? "NEEDS_INFORMATION"
      : "LEGAL_REVIEWED";
    const legalDecision = data.decision === "NEEDS_MORE_EVIDENCE" ? null : data.decision;
    const candidates = await sql<{ title_id: string; current_owner_user_id_snapshot: string; status: ClaimStatus }>`
      select title_id, current_owner_user_id_snapshot, status
      from bridge_title_ownership_claims
      where id = ${data.claimId}
      limit 1
    `;
    const candidate = candidates[0];
    if (!candidate || candidate.status !== "REFERRED_TO_LEGAL") {
      throw new Error("Claim is not in the Legal review queue.");
    }
    const currentTitle = await loadTitle(candidate.title_id);
    if (!currentTitle || currentTitle.ownerUserId !== candidate.current_owner_user_id_snapshot) {
      throw new Error("The recorded title owner changed since this claim was filed. Stop review and reconcile the newer owner record.");
    }
    const updated = await sql<{ id: string }>`
      update bridge_title_ownership_claims
      set status = ${nextStatus}, legal_decision = ${legalDecision},
          legal_reviewed_by = ${actor.userId}, legal_reviewed_at = now(),
          legal_review_note = ${data.note}, updated_at = now()
      where id = ${data.claimId} and status = 'REFERRED_TO_LEGAL'
        and current_owner_user_id_snapshot = ${candidate.current_owner_user_id_snapshot}
      returning id
    `;
    if (!updated[0]) throw new Error("Claim is not in the Legal review queue.");
    const action = data.decision === "SUPPORTED"
      ? "LEGAL_SUPPORTED"
      : data.decision === "NOT_SUPPORTED"
        ? "LEGAL_NOT_SUPPORTED"
        : "LEGAL_NEEDS_MORE_EVIDENCE";
    await insertClaimEvent(sql, data.claimId, actor.userId, action, data.note);
    await writeAudit({
      actorUserId: actor.userId,
      action: "title.ownership_claim_legal_reviewed",
      entityType: "bridge_title_ownership_claim",
      entityId: data.claimId,
      metadata: {
        decision: data.decision,
        titleOwnershipChanged: false,
        rightsGrantChanged: false,
        assetAttributionChanged: false,
      },
    });
    return {
      reviewed: true as const,
      titleOwnershipChanged: false as const,
      rightsGrantChanged: false as const,
      assetAttributionChanged: false as const,
    };
  });


/**
 * A narrow discovery helper for creators whose claim target is not in their
 * owner-scoped title list. Producer credit is used only to locate a candidate;
 * it is expressly not treated as legal ownership or permission to read assets.
 */
export const searchOwnershipClaimTargets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleNameQuery: z.string().trim().min(3).max(160),
    producerEntityName: z.string().trim().min(3).max(200),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertCreatorClaimant(actor);
    const sql = await getSql();
    const titlePattern = `%${data.titleNameQuery}%`;
    const producerPattern = `%${data.producerEntityName}%`;
    const rows = await sql<{
      id: string;
      name: string;
      status: string;
      producer_credit: string;
    }>`
      select
        t.id,
        t.name,
        t.status,
        credit.item->>'name' as producer_credit
      from bridge_titles t
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(t.credits) = 'array' then t.credits else '[]'::jsonb end
      ) as credit(item)
      where t.name ilike ${titlePattern}
        and t.status in ('RIGHTS_REVIEW','LICENSING_READY','LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
        and lower(coalesce(credit.item->>'role','')) = 'producer'
        and credit.item->>'name' ilike ${producerPattern}
      order by t.updated_at desc
      limit 20
    `;
    return {
      titles: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        producerCredit: row.producer_credit,
      })),
    };
  });
