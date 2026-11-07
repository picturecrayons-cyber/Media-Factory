import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, canOperateOnTitle, type Actor } from "./rbac";
import { writeAudit } from "./audit";

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
  }>`select id,title_id,asset_group,processing_state,checksum_sha256,created_by
    from bridge_asset_versions where id=${data.assetVersionId} for update`;
  if (
    !asset ||
    asset.title_id !== data.titleId ||
    asset.asset_group !== "DOCUMENT" ||
    asset.processing_state !== "PASSED" ||
    asset.created_by !== actor.userId ||
    !asset.checksum_sha256 ||
    !/^[a-f0-9]{64}$/i.test(asset.checksum_sha256)
  ) throw new Error("Evidence must be a current, processed DOCUMENT asset with a SHA-256 checksum uploaded by the submitting owner");

  const [row] = await tx<{ id: string }>`insert into bridge_rights_evidence
    (title_id,rights_grant_id,evidence_type,asset_version_id,checksum_sha256,submitted_by,status)
    values (${data.titleId},${data.grantId},${data.evidenceType},${data.assetVersionId},${asset.checksum_sha256},${actor.userId},'PENDING')
    returning id`;
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
  }>`select e.id,e.title_id,e.rights_grant_id,e.asset_version_id,e.checksum_sha256,e.submitted_by,e.status,
      g.created_by as grant_created_by,av.checksum_sha256 as asset_checksum,av.processing_state as asset_state
    from bridge_rights_evidence e
    join bridge_rights_grants g on g.id=e.rights_grant_id
    join bridge_asset_versions av on av.id=e.asset_version_id and av.title_id=e.title_id and av.asset_group='DOCUMENT'
    where e.id=${data.evidenceId} and g.status='DRAFT' for update of e,g,av`;
  if (!evidence || evidence.status !== "PENDING") throw new Error("Pending rights evidence was not found");
  if (actor.userId === evidence.grant_created_by || actor.userId === evidence.submitted_by)
    throw new Error("The license creator and evidence submitter cannot review this evidence");
  if (
    evidence.asset_state !== "PASSED" ||
    !evidence.asset_checksum ||
    evidence.asset_checksum.toLowerCase() !== evidence.checksum_sha256.toLowerCase()
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

export const submitRightsEvidenceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(evidenceInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    return (await getSql()).transaction((tx) => submitRightsEvidence(tx, actor, data));
  });

export const reviewRightsEvidenceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(evidenceReviewInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    return (await getSql()).transaction((tx) => reviewRightsEvidence(tx, actor, data));
  });
