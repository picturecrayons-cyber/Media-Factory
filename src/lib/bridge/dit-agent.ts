import { createHash, timingSafeEqual } from "node:crypto";

export type DitQcResult = "pending" | "passed" | "failed";
export type DitAgentActor = {
  userId: string;
  emailVerified: boolean;
  actorKind: "human" | "agent";
  internalRole: "dit_operator" | "super_admin" | "admin" | "qc_reviewer" | "legal_reviewer" | "finance" | "viewer" | null;
};
export type DitBackupEvidence = {
  objectKey: string;
  failureDomain: string;
  byteSize: number;
  sha256: string;
  verifiedAt: string;
};
export type DitIngestEvidence = {
  assetId: string;
  sourceObjectKey: string;
  byteSize: number;
  sha256: string;
  backups: readonly DitBackupEvidence[];
  qc: DitQcResult;
};
export type DitReadiness = { ready: boolean; blockers: string[] };

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Matches(expected: string, actual: string): boolean {
  if (!SHA256_HEX.test(expected) || !SHA256_HEX.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected.toLowerCase(), "hex"), Buffer.from(actual.toLowerCase(), "hex"));
}

export function canReadDitWorkspace(actor: DitAgentActor): boolean {
  return actor.emailVerified && actor.actorKind === "human" &&
    (actor.internalRole === "dit_operator" || actor.internalRole === "super_admin");
}

export function canSignOffDit(actor: DitAgentActor): boolean {
  return canReadDitWorkspace(actor) &&
    (actor.internalRole === "dit_operator" || actor.internalRole === "super_admin");
}

export function evaluateDitReadiness(evidence: DitIngestEvidence): DitReadiness {
  const blockers: string[] = [];
  if (!evidence.assetId.trim()) blockers.push("asset_id_missing");
  if (!evidence.sourceObjectKey.trim()) blockers.push("source_object_missing");
  if (!Number.isSafeInteger(evidence.byteSize) || evidence.byteSize <= 0) blockers.push("source_size_invalid");
  if (!SHA256_HEX.test(evidence.sha256)) blockers.push("source_sha256_missing_or_invalid");

  if (evidence.backups.length !== 3) blockers.push("exactly_three_backups_required");
  const keys = new Set<string>();
  const domains = new Set<string>();
  for (const [index, backup] of evidence.backups.entries()) {
    if (!backup.objectKey.trim() || backup.objectKey === evidence.sourceObjectKey) blockers.push(`backup_${index + 1}_object_key_invalid`);
    if (keys.has(backup.objectKey)) blockers.push("backup_object_keys_must_be_unique");
    keys.add(backup.objectKey);
    if (!backup.failureDomain.trim() || domains.has(backup.failureDomain)) blockers.push("backup_failure_domains_must_be_unique");
    domains.add(backup.failureDomain);
    if (!Number.isSafeInteger(backup.byteSize) || backup.byteSize !== evidence.byteSize) blockers.push(`backup_${index + 1}_size_mismatch`);
    if (!sha256Matches(evidence.sha256, backup.sha256)) blockers.push(`backup_${index + 1}_sha256_mismatch`);
    if (!ISO_DATE.test(backup.verifiedAt) || Number.isNaN(Date.parse(backup.verifiedAt))) blockers.push(`backup_${index + 1}_verification_time_invalid`);
  }
  if (evidence.qc !== "passed") blockers.push(evidence.qc === "failed" ? "qc_failed" : "qc_not_passed");
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export type DitSignoff = {
  assetId: string;
  signedBy: string;
  signedAt: string;
  evidenceSha256: string;
  approval: "human";
};

export function createDitSignoff(args: {
  actor: DitAgentActor;
  evidence: DitIngestEvidence;
  signedAt: string;
}): DitSignoff {
  if (!canSignOffDit(args.actor)) throw new Error("Forbidden: verified human DIT operator approval required");
  if (!ISO_DATE.test(args.signedAt) || Number.isNaN(Date.parse(args.signedAt))) throw new Error("Invalid sign-off timestamp");
  const readiness = evaluateDitReadiness(args.evidence);
  if (!readiness.ready) throw new Error(`DIT sign-off blocked: ${readiness.blockers.join(", ")}`);
  return {
    assetId: args.evidence.assetId,
    signedBy: args.actor.userId,
    signedAt: args.signedAt,
    evidenceSha256: args.evidence.sha256.toLowerCase(),
    approval: "human",
  };
}
