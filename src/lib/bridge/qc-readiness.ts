import type { Sql } from "../db.ts";

const REQUIRED_QC_FILES = [
  { label: "main film", kinds: ["master"] },
  { label: "trailer", kinds: ["screener"] },
  { label: "vertical poster", kinds: ["poster_vertical", "poster"] },
  { label: "horizontal artwork", kinds: ["poster_horizontal"] },
  { label: "thumbnail", kinds: ["thumbnail"] },
  { label: "subtitles", kinds: ["subtitle"] },
  { label: "censor/legal certificate", kinds: ["censor_certificate"] },
] as const;

export async function assertSevenFilesStorageVerified(tx: Sql, titleId: string) {
  const assets = await tx<{
    kind: string; created_at: string | Date; checksum_sha256: string | null; verified_object_key: string | null;
    storage_provider: string | null; storage_bucket: string | null; storage_namespace: string | null;
    storage_region: string | null; storage_endpoint: string | null; storage_verified_at: string | Date | null;
  }>`
    select kind, checksum_sha256, verified_object_key, storage_provider, storage_bucket,
      storage_namespace, storage_region, storage_endpoint, storage_verified_at
    from bridge_assets where title_id=${titleId} order by created_at desc
  `;
  const isStorageVerified = (asset: (typeof assets)[number]) =>
    Boolean(asset.verified_object_key) &&
    Boolean(asset.storage_provider && asset.storage_bucket && asset.storage_namespace &&
      asset.storage_region && asset.storage_endpoint && asset.storage_verified_at) &&
    Boolean(asset.checksum_sha256 && /^[a-f0-9]{64}$/.test(asset.checksum_sha256));
  // Query order is newest-first. A newer pending replacement supersedes an older verified file.
  const missing = REQUIRED_QC_FILES.filter((required) => {
    const latest = assets.find((asset) => required.kinds.some((kind) => kind === asset.kind));
    return !latest || !isStorageVerified(latest);
  });
  if (missing.length) {
    throw new Error(
      `Package blocked: all 7 mandatory files must be Storage verified (missing or unverified: ${missing.map((item) => item.label).join(", ")})`
    );
  }

}

export async function assertVerifiedTitleIngestReady(tx: Sql, titleId: string) {
  await assertSevenFilesStorageVerified(tx, titleId);
  const rights = await tx<{
    authority_type: string | null;
    authorization_evidence_type: string | null;
    authorization_confirmed: boolean;
    evidence: Array<{ type?: string; rightsBasis?: string; authorizationConfirmed?: boolean }>;
  }>`
    select i.authority_type, i.authorization_evidence_type, i.authorization_confirmed, g.evidence
    from bridge_title_submission_intake i
    join bridge_rights_grants g on g.title_id=i.title_id
    where i.title_id=${titleId} and g.status in ('DRAFT','VALID')
    order by g.created_at desc limit 1
  `;
  const rightsRow = rights[0];
  const allowedAuthority = new Set([
    "RIGHTS_OWNER","LICENSEE_WITH_ONWARD_RIGHTS","DISTRIBUTOR_SALES_AGENT","PRODUCER",
  ]);
  const attestation = rightsRow?.evidence?.some((item) =>
    item.type === "AUTHORIZATION_ATTESTATION" &&
    Boolean(item.rightsBasis) &&
    item.authorizationConfirmed === true
  );
  if (
    !rightsRow ||
    !allowedAuthority.has(rightsRow.authority_type ?? "") ||
    !rightsRow.authorization_evidence_type ||
    rightsRow.authorization_confirmed !== true ||
    !attestation
  ) {
    throw new Error("QC blocked: rights-holder classification and authorization evidence are incomplete");
  }
}
