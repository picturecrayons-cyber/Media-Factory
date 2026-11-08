import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, canOperateOnTitle, type Actor } from "./rbac";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { titleAssetKey, signUpload, verifyObjectSha256, sealVerifiedObject } from "./oci-object-storage.server";

const evidenceInput = z.object({
  titleId: z.string().min(8),
  grantId: z.string().uuid(),
  evidenceType: z.enum(["EXECUTED_AGREEMENT", "OWNERSHIP_CHAIN"]),
  assetVersionId: z.string().uuid(),
});

const evidenceReviewInput = z.object({
  evidenceId: z.string().uuid(),
  decision: z.enum(["VERIFIED", "REJECTED"]),
  note: z.string().trim().min(8).max(2000),
});

export async function submitRightsEvidence(
  tx: Sql,
  actor: Actor,
  input: z.infer<typeof evidenceInput>,
) {
  const data = evidenceInput.parse(input);
  if (actor.internalRole) throw new Error("Only the title owner or authorized Studio member may submit rights evidence");
  const [title] = await tx<{
    owner_user_id: string;
    owner_account_type: string;
    owner_organization_id: string | null;
  }>`select owner_user_id,owner_account_type,owner_organization_id
    from bridge_titles where id=${data.titleId} for update`;
  if (!title || !canOperateOnTitle(
    actor,
    { ownerUserId: title.owner_user_id, ownerAccountType: title.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor", ownerOrganizationId: title.owner_organization_id },
    "title.update_own",
    "title.license",
  )) throw new Error("Forbidden");

  const [grant] = await tx<{ id: string; status: string }>`select id,status from bridge_rights_grants
    where id=${data.grantId} and title_id=${data.titleId} for update`;
  if (!grant || grant.status !== "DRAFT") throw new Error("Only an existing DRAFT license can receive evidence");

  const [asset] = await tx<{
    id: string;
    title_id: string;
    asset_group: string;
    processing_state: string;
    checksum_sha256: string | null;
    created_by: string;
    asset_kind: string;
    asset_key: string;
    verified_object_key: string | null;
    storage_verified_at: string | Date | null;
    stored_checksum: string | null;
  }>`select av.id,av.title_id,av.asset_group,av.processing_state,av.checksum_sha256,av.created_by,a.kind as asset_kind,
      a.s3_key as asset_key,a.verified_object_key,a.storage_verified_at,a.checksum_sha256 as stored_checksum
    from bridge_asset_versions av
    join bridge_assets a on a.asset_version_id=av.id and a.kind='rights_document'
    where av.id=${data.assetVersionId} for update of av,a`;
  if (
    !asset ||
    asset.title_id !== data.titleId ||
    asset.asset_group !== "DOCUMENT" ||
    asset.processing_state !== "PASSED" ||
    asset.created_by !== actor.userId ||
    !asset.checksum_sha256 ||
    !asset.storage_verified_at ||
    asset.verified_object_key !== asset.asset_key ||
    asset.asset_key === "" ||
    asset.stored_checksum?.toLowerCase() !== asset.checksum_sha256.toLowerCase() ||
    !/^[a-f0-9]{64}$/i.test(asset.checksum_sha256)
  ) throw new Error("Evidence must be a current, processed DOCUMENT asset with a SHA-256 checksum uploaded by the submitting owner");

  const [row] = await tx<{ id: string }>`insert into bridge_rights_evidence
    (title_id,rights_grant_id,evidence_type,asset_version_id,checksum_sha256,submitted_by,status)
    values (${data.titleId},${data.grantId},${data.evidenceType},${data.assetVersionId},${asset.checksum_sha256},${actor.userId},'PENDING')
    on conflict (rights_grant_id,evidence_type,asset_version_id) do nothing
    returning id`;
  if (!row) {
    const [existing] = await tx<{ id: string; checksum_sha256: string; submitted_by: string; status: "PENDING" | "VERIFIED" | "REJECTED" }>`select id,checksum_sha256,submitted_by,status
      from bridge_rights_evidence
      where rights_grant_id=${data.grantId} and evidence_type=${data.evidenceType} and asset_version_id=${data.assetVersionId}`;
    if (!existing || existing.submitted_by !== actor.userId ||
        existing.checksum_sha256.toLowerCase() !== asset.checksum_sha256.toLowerCase())
      throw new Error("This evidence asset is already registered to another submission; use a new verified document version");
    return { evidenceId: existing.id, status: existing.status };
  }
  await writeAudit({
    actorUserId: actor.userId,
    action: "rights.evidence.submit",
    entityType: "bridge_title",
    entityId: data.titleId,
    metadata: { grantId: data.grantId, evidenceId: row.id, evidenceType: data.evidenceType, assetVersionId: data.assetVersionId, checksumSha256: asset.checksum_sha256 },
  }, tx);
  return { evidenceId: row.id, status: "PENDING" as const };
}

export async function reviewRightsEvidence(
  tx: Sql,
  actor: Actor,
  input: z.infer<typeof evidenceReviewInput>,
) {
  const data = evidenceReviewInput.parse(input);
  assertPermission(actor, "title.rights_review");
  const [evidence] = await tx<{
    id: string;
    title_id: string;
    rights_grant_id: string;
    asset_version_id: string;
    checksum_sha256: string;
    submitted_by: string;
    status: string;
    grant_created_by: string;
    asset_checksum: string | null;
    asset_state: string;
    asset_key: string;
    verified_object_key: string | null;
    storage_verified_at: string | Date | null;
    stored_checksum: string | null;
    version_key: string;
  }>`select e.id,e.title_id,e.rights_grant_id,e.asset_version_id,e.checksum_sha256,e.submitted_by,e.status,
      g.created_by as grant_created_by,av.checksum_sha256 as asset_checksum,av.processing_state as asset_state,
      av.s3_key as version_key,a.s3_key as asset_key,a.verified_object_key,a.storage_verified_at,a.checksum_sha256 as stored_checksum
    from bridge_rights_evidence e
    join bridge_rights_grants g on g.id=e.rights_grant_id and g.status='DRAFT'
    join bridge_asset_versions av on av.id=e.asset_version_id and av.title_id=e.title_id
      and av.asset_group='DOCUMENT' and av.asset_type='RIGHTS_EVIDENCE'
    join bridge_assets a on a.asset_version_id=av.id and a.kind='rights_document'
    where e.id=${data.evidenceId} for update of e,g,av,a`;
  if (!evidence || evidence.status !== "PENDING") throw new Error("Pending rights evidence was not found");
  if (actor.userId === evidence.grant_created_by || actor.userId === evidence.submitted_by)
    throw new Error("The license creator and evidence submitter cannot review this evidence");
  if (
    evidence.asset_state !== "PASSED" ||
    !evidence.asset_checksum ||
    evidence.asset_checksum.toLowerCase() !== evidence.checksum_sha256.toLowerCase() ||
    !evidence.storage_verified_at ||
    evidence.verified_object_key !== evidence.asset_key ||
    evidence.asset_key !== evidence.version_key ||
    evidence.stored_checksum?.toLowerCase() !== evidence.checksum_sha256.toLowerCase()
  ) throw new Error("Evidence asset changed or is no longer verified; submit a current document version");

  await tx`update bridge_rights_evidence
    set status=${data.decision},reviewed_by=${actor.userId},reviewed_at=now(),review_note=${data.note}
    where id=${data.evidenceId} and status='PENDING'`;
  await tx`insert into bridge_rights_evidence_reviews
    (evidence_id,decision,reviewer_user_id,evidence_checksum_sha256,note)
    values (${data.evidenceId},${data.decision},${actor.userId},${evidence.checksum_sha256},${data.note})`;
  await writeAudit({
    actorUserId: actor.userId,
    action: `rights.evidence.${data.decision.toLowerCase()}`,
    entityType: "bridge_title",
    entityId: evidence.title_id,
    metadata: { grantId: evidence.rights_grant_id, evidenceId: evidence.id, checksumSha256: evidence.checksum_sha256 },
  }, tx);
  return { evidenceId: evidence.id, status: data.decision };
}


const rightsEvidenceUploadInput = z.object({
  titleId: z.string().min(8),
  grantId: z.string().uuid(),
  evidenceType: z.enum(["EXECUTED_AGREEMENT", "OWNERSHIP_CHAIN"]),
  filename: z.string().trim().min(1).max(120),
  contentType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  byteSize: z.number().int().positive().max(25 * 1024 * 1024),
});

export const requestRightsEvidenceUploadFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(rightsEvidenceUploadInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole) throw new Error("Only the title owner or authorized Studio member may upload rights evidence");
    const sql = await getSql();
    const [title] = await sql<{
      id: string;
      owner_user_id: string;
      owner_account_type: string;
      owner_organization_id: string | null;
      status: string;
    }>`select id,owner_user_id,owner_account_type,owner_organization_id,status
      from bridge_titles where id=${data.titleId}`;
    if (!title || title.status !== "RIGHTS_REVIEW" || !canOperateOnTitle(
      actor,
      { ownerUserId: title.owner_user_id, ownerAccountType: title.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor", ownerOrganizationId: title.owner_organization_id },
      "title.update_own",
      "title.license",
    )) throw new Error("Rights evidence upload is available only to the title owner during RIGHTS_REVIEW");
    const [grant] = await sql<{ id: string; status: string }>`select id,status from bridge_rights_grants
      where id=${data.grantId} and title_id=${data.titleId}`;
    if (!grant || grant.status !== "DRAFT") throw new Error("Select an active DRAFT license before uploading evidence");

    const assetId = randomBytes(16).toString("hex");
    const key = titleAssetKey({
      ownerUserId: title.owner_user_id,
      titleId: title.id,
      kind: "rights_document",
      filename: data.filename,
    });
    const signed = await signUpload({ key, contentType: data.contentType, expiresIn: 900 });
    await sql`insert into bridge_assets(
        id,title_id,kind,s3_key,content_type,created_by,original_filename,
        storage_provider,storage_bucket,storage_namespace,storage_region,storage_endpoint,source_object_key
      )
      values (
        ${assetId},${title.id},'rights_document',${key},${data.contentType},${actor.userId},${data.filename},
        'oci',${signed.bucket},${signed.namespace},${signed.region},${signed.endpoint},${key}
      )`;
    await writeAudit({
      actorUserId: actor.userId,
      action: "rights.evidence.upload_signed",
      entityType: "bridge_title",
      entityId: title.id,
      metadata: { grantId: data.grantId, assetId, evidenceType: data.evidenceType, byteSize: data.byteSize },
    });
    return { assetId, url: signed.url, method: signed.method, key };
  });

export const confirmRightsEvidenceUploadFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    assetId: z.string().min(8),
    expectedByteSize: z.number().int().positive().max(25 * 1024 * 1024),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole) throw new Error("Only the title owner or authorized Studio member may confirm rights evidence uploads");
    const sql = await getSql();
    const [asset] = await sql<{
      id: string;
      title_id: string;
      kind: string;
      s3_key: string;
      created_by: string;
      content_type: string | null;
      byte_size: number | null;
      asset_version_id: string | null;
      storage_bucket: string | null;
    }>`select id,title_id,kind,s3_key,created_by,content_type,byte_size,asset_version_id,storage_bucket
      from bridge_assets where id=${data.assetId}`;
    if (!asset || asset.kind !== "rights_document" || asset.created_by !== actor.userId)
      throw new Error("Rights document upload was not found for this owner");
    const [title] = await sql<{
      id: string;
      owner_user_id: string;
      owner_account_type: string;
      owner_organization_id: string | null;
      status: string;
    }>`select id,owner_user_id,owner_account_type,owner_organization_id,status
      from bridge_titles where id=${asset.title_id}`;
    if (!title || title.status !== "RIGHTS_REVIEW" || !canOperateOnTitle(
      actor,
      { ownerUserId: title.owner_user_id, ownerAccountType: title.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor", ownerOrganizationId: title.owner_organization_id },
      "title.update_own",
      "title.license",
    )) throw new Error("Rights evidence confirmation is closed for this title");

    if (asset.byte_size != null && asset.asset_version_id) {
      return { assetVersionId: asset.asset_version_id, byteSize: Number(asset.byte_size), checksumVerified: true as const };
    }
    const original = await verifyObjectSha256(asset.s3_key, asset.content_type);
    if (original.byteSize !== data.expectedByteSize) throw new Error("Uploaded evidence size does not match the selected file");
    if (!original.etag) throw new Error("Object ETag is required for immutable evidence sealing");
    const sealedKey = `${asset.s3_key}.verified/${asset.id}`;
    await sealVerifiedObject(asset.s3_key, sealedKey, original.etag);
    const sealed = await verifyObjectSha256(sealedKey, asset.content_type);
    if (sealed.byteSize !== original.byteSize || sealed.checksumSha256 !== original.checksumSha256)
      throw new Error("Sealed rights evidence differs from the uploaded document");

    const assetVersionId = await sql.transaction(async (tx) => {
      await tx`select id from bridge_titles where id=${title.id} for update`;
      const [current] = await tx<{ byte_size: number | null; asset_version_id: string | null }>`select byte_size,asset_version_id
        from bridge_assets where id=${asset.id} and created_by=${actor.userId} for update`;
      if (!current) throw new Error("Rights document asset is unavailable");
      if (current.byte_size != null && current.asset_version_id) return current.asset_version_id;
      const [next] = await tx<{ version: number }>`select coalesce(max(version),0)+1 as version
        from bridge_asset_versions where title_id=${title.id} and asset_type='RIGHTS_EVIDENCE'`;
      const [version] = await tx<{ id: string }>`insert into bridge_asset_versions
        (title_id,asset_group,asset_type,version,s3_key,checksum_sha256,byte_size,processing_state,created_by)
        values (${title.id},'DOCUMENT','RIGHTS_EVIDENCE',${next.version},${sealedKey},${sealed.checksumSha256},${sealed.byteSize},'PASSED',${actor.userId})
        returning id`;
      await tx`update bridge_assets set byte_size=${sealed.byteSize},content_type=${sealed.contentType},
        s3_key=${sealedKey},sha256=${sealed.checksumSha256},checksum_sha256=${sealed.checksumSha256},
        verified_object_key=${sealedKey},storage_verified_at=now(),storage_bucket=${asset.storage_bucket},
        asset_version_id=${version.id}
        where id=${asset.id} and created_by=${actor.userId} and byte_size is null`;
      await writeAudit({
        actorUserId: actor.userId,
        action: "rights.evidence.upload_verified",
        entityType: "bridge_title",
        entityId: title.id,
        metadata: { assetId: asset.id, assetVersionId: version.id, checksumSha256: sealed.checksumSha256, byteSize: sealed.byteSize },
      }, tx);
      return version.id;
    });
    return { assetVersionId, byteSize: sealed.byteSize, checksumVerified: true as const };
  });

export const submitRightsEvidenceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(evidenceInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    return (await getSql()).transaction((tx) => submitRightsEvidence(tx, actor, data));
  });

export const reviewRightsEvidenceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(evidenceReviewInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    return (await getSql()).transaction((tx) => reviewRightsEvidence(tx, actor, data));
  });
