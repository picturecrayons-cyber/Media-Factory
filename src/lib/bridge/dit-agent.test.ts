import test from "node:test";
import assert from "node:assert/strict";
import {
  canReadDitWorkspace,
  canSignOffDit,
  createDitSignoff,
  evaluateDitReadiness,
  sha256Hex,
  sha256Matches,
  type DitAgentActor,
  type DitIngestEvidence,
} from "./dit-agent.ts";

const digest = sha256Hex(new TextEncoder().encode("camera-original-content"));
const goodEvidence = (): DitIngestEvidence => ({
  assetId: "asset-dit-001",
  sourceObjectKey: "bridge/title/source/camera-a.mov",
  byteSize: 24,
  sha256: digest,
  qc: "passed",
  backups: [1, 2, 3].map((n) => ({
    objectKey: `backup-${n}/camera-a.mov`,
    failureDomain: `location-${n}`,
    byteSize: 24,
    sha256: digest,
    verifiedAt: "2026-11-11T10:00:00Z",
  })),
});
const dit: DitAgentActor = { userId: "dit-user", emailVerified: true, actorKind: "human", internalRole: "dit_operator" };
const agent: DitAgentActor = { userId: "dit-agent", emailVerified: true, actorKind: "agent", internalRole: "dit_operator" };

test("SHA-256 digest is stable and malformed values fail closed", () => {
  assert.equal(digest.length, 64);
  assert.equal(sha256Matches(digest, digest.toUpperCase()), true);
  assert.equal(sha256Matches("etag-not-sha256", digest), false);
  assert.notEqual(sha256Hex(new TextEncoder().encode("different")), digest);
});

test("DIT workspace and sign-off require a verified human DIT operator or super admin", () => {
  assert.equal(canReadDitWorkspace(dit), true);
  assert.equal(canSignOffDit(dit), true);
  assert.equal(canReadDitWorkspace({ ...dit, emailVerified: false }), false);
  assert.equal(canSignOffDit({ ...dit, actorKind: "agent" }), false);
  assert.equal(canSignOffDit({ ...dit, internalRole: "viewer" }), false);
  assert.equal(canSignOffDit({ ...dit, internalRole: "qc_reviewer" }), false);
  assert.equal(canSignOffDit({ ...dit, internalRole: "super_admin" }), true);
});

test("three distinct backup locations with matching SHA-256 and byte size pass readiness", () => {
  assert.deepEqual(evaluateDitReadiness(goodEvidence()), { ready: true, blockers: [] });
});

test("missing backup, duplicate location, checksum mismatch and unpassed QC block readiness", () => {
  const evidence = goodEvidence();
  evidence.backups = [
    evidence.backups[0],
    { ...evidence.backups[1], failureDomain: evidence.backups[0].failureDomain, sha256: sha256Hex(new TextEncoder().encode("tampered")) },
  ];
  evidence.qc = "pending";
  const result = evaluateDitReadiness(evidence);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("exactly_three_backups_required"));
  assert.ok(result.blockers.includes("backup_failure_domains_must_be_unique"));
  assert.ok(result.blockers.includes("backup_2_sha256_mismatch"));
  assert.ok(result.blockers.includes("qc_not_passed"));
});

test("backup object keys and failure domains must be unique and independent", () => {
  const evidence = goodEvidence();
  evidence.backups = evidence.backups.map((item) => ({ ...item, failureDomain: "same-bucket" }));
  assert.ok(evaluateDitReadiness(evidence).blockers.includes("backup_failure_domains_must_be_unique"));
});

test("sign-off is human, explicit, and impossible until all evidence gates pass", () => {
  const signoff = createDitSignoff({ actor: dit, evidence: goodEvidence(), signedAt: "2026-11-11T11:00:00Z" });
  assert.equal(signoff.approval, "human");
  assert.equal(signoff.signedBy, "dit-user");
  assert.equal(signoff.assetId, "asset-dit-001");
  assert.throws(() => createDitSignoff({ actor: agent, evidence: goodEvidence(), signedAt: "2026-11-11T11:00:00Z" }), /Forbidden/);
  const blocked = goodEvidence();
  blocked.qc = "failed";
  assert.throws(() => createDitSignoff({ actor: dit, evidence: blocked, signedAt: "2026-11-11T11:00:00Z" }), /qc_failed/);
  assert.throws(() => createDitSignoff({ actor: dit, evidence: goodEvidence(), signedAt: "not-a-date" }), /timestamp/);
});
