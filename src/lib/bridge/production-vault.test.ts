import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAudit,
  buildClipLedger,
  buildVaultObjectKey,
  completeConversion,
  createIngestManifest,
  evaluateDitSignoff,
  queueConversion,
  recordConversionAttempt,
  reconcileManifest,
  requiredCopyMatrix,
  runClapAssistant,
  verifyStorageCopy,
  type ClipRecord,
  type CopyVerification,
} from "./production-vault.ts";

const hash = "a".repeat(64);
const clip: ClipRecord = {
  clipNumber: "001",
  originalFilename: "A001_C001.mov",
  originalRelativePath: "A001/VIDEO/A001_C001.mov",
  byteSize: 1024,
  checksumSha256: hash,
  hasVideo: true,
  hasAudio: true,
  durationMs: 120000,
  frameRate: 24,
  width: 4096,
  height: 2160,
  codec: "ProRes RAW",
};
const manifest = () => createIngestManifest({
  manifestId: "manifest-1",
  productionId: "prod-1",
  shootingDayId: "day-1",
  camera: "A",
  cardNo: "CARD-07",
  createdAt: "2026-11-04T10:00:00.000Z",
  entries: [clip],
});
const copy = (overrides: Partial<CopyVerification> = {}): CopyVerification => ({
  copyId: "copy-1",
  clipNumber: "001",
  kind: "RAW",
  tier: "MASTER",
  expectedByteSize: 1024,
  expectedSha256: hash,
  observedByteSize: 1024,
  observedSha256: hash,
  independentlyVerified: true,
  verifiedAt: "2026-11-04T10:01:00.000Z",
  storageLocationId: "volume-master",
  ...overrides,
});

test("vault key preserves original nested RAW paths and approved tier structure", () => {
  assert.equal(
    buildVaultObjectKey({ filmName: "Film One", productionNo: "P-01", tier: "MASTER", date: "2026-11-04", camera: "A", cardNo: "CARD-07", kind: "RAW", originalRelativePath: clip.originalRelativePath }),
    "Film_One_P-01/MASTER/2026-11-04/CAMERA_A/CARD-07/RAW/A001/VIDEO/A001_C001.mov",
  );
  assert.match(buildVaultObjectKey({ filmName: "Film", productionNo: "P1", tier: "BACKUP_2", date: "2026-11-04", kind: "AUDIO" }), /BACKUP_2\/2026-11-04\/AUDIO/);
  assert.throws(() => buildVaultObjectKey({ filmName: "Film", productionNo: "P1", tier: "MASTER", date: "2026-11-04", camera: "A", cardNo: "C1", kind: "RAW", originalRelativePath: "../escape.mov" }), /Unsafe/);
  assert.throws(() => buildVaultObjectKey({ filmName: "Film", productionNo: "P1", tier: "BACKUP_2", date: "2026-11-04", camera: "A", cardNo: "C1", kind: "CONVERTED" }), /outside/);
});

test("manifest reconciliation catches missing, unexpected, duplicate and malformed clips", () => {
  const m = manifest();
  assert.equal(reconcileManifest(m, [clip]).result, "PASS");
  assert.deepEqual(reconcileManifest(m, []).missingClipNumbers, ["001"]);
  assert.deepEqual(reconcileManifest(m, [clip, clip]).duplicateClipNumbers, ["001"]);
  assert.equal(reconcileManifest(m, [{ ...clip, clipNumber: "002" }]).result, "FAIL");
  assert.equal(reconcileManifest({ ...m, entries: [{ ...clip, checksumSha256: "bad" }] }, [clip]).result, "FAIL");
});

test("clip ledger starts NOT_CHECKED and Clap Assistant requires integrity and stream evidence", () => {
  const [entry] = buildClipLedger("A", "CARD-07", [clip]);
  assert.equal(entry.automatedResult, "NOT_CHECKED");
  const checked = runClapAssistant({ clip: entry, manifestResult: "PASS", sourceCopyResult: "PASS", audioRequired: true });
  assert.equal(checked.automatedResult, "PASS");
  const bad = runClapAssistant({ clip: entry, manifestResult: "FAIL", sourceCopyResult: "PASS", audioRequired: true });
  assert.equal(bad.automatedResult, "FAIL");
  assert.match(bad.automatedReasons.join(" "), /manifest/);
  const noAudio = runClapAssistant({ clip: { ...entry, hasAudio: false }, manifestResult: "PASS", sourceCopyResult: "PASS", audioRequired: true });
  assert.equal(noAudio.automatedResult, "FAIL");
  const warning = runClapAssistant({ clip: entry, manifestResult: "PASS", sourceCopyResult: "PASS", audioRequired: true, analysisWarnings: ["Audio peak review required"] });
  assert.equal(warning.automatedResult, "WARNING");
});

test("storage copy verification requires exact byte count, checksum and independent evidence", () => {
  assert.equal(verifyStorageCopy(copy()).result, "PASS");
  assert.equal(verifyStorageCopy(copy({ observedByteSize: 1000 })).result, "FAIL");
  assert.equal(verifyStorageCopy(copy({ independentlyVerified: false })).result, "FAIL");
  assert.equal(verifyStorageCopy(copy({ observedSha256: "b".repeat(64) })).result, "FAIL");
  assert.equal(verifyStorageCopy(copy({ observedSha256: null, verifiedAt: null })).result, "FAIL");
});

test("conversion is blocked until source is verified and automated check is complete", () => {
  const [entry] = buildClipLedger("A", "CARD-07", [clip]);
  assert.throws(() => queueConversion({ jobId: "j1", clip: entry, sourceVerified: false, resolution: "1080p", outputType: "Proxy", at: "now" }), /verified RAW/);
  assert.throws(() => queueConversion({ jobId: "j1", clip: entry, sourceVerified: true, resolution: "1080p", outputType: "Proxy", at: "now" }), /checked/);
});

test("conversion completion needs independently verified MASTER and BACKUP_1 outputs", () => {
  const [entry] = buildClipLedger("A", "CARD-07", [clip]);
  const checked = runClapAssistant({ clip: entry, manifestResult: "PASS", sourceCopyResult: "PASS", audioRequired: true });
  const job = queueConversion({ jobId: "j1", clip: checked, sourceVerified: true, resolution: "1080p", outputType: "ProRes", at: "now" });
  assert.equal(job.profile.codec, "Apple ProRes 422 HQ");
  const processing = { ...job, state: "PROCESSING" as const, attempt: 1 };
  const master = copy({ copyId: "master-converted", kind: "CONVERTED", tier: "MASTER" });
  const backup = copy({ copyId: "backup-converted", kind: "CONVERTED", tier: "BACKUP_1" });
  assert.equal(completeConversion(processing, master, backup, "later").state, "COMPLETE");
  assert.throws(() => completeConversion(processing, master, copy({ kind: "CONVERTED", tier: "BACKUP_2" }), "later"), /MASTER and BACKUP_1/);
});

test("retry history is append-only and terminal jobs cannot be retried", () => {
  const [entry] = buildClipLedger("A", "CARD-07", [clip]);
  const checked = runClapAssistant({ clip: entry, manifestResult: "PASS", sourceCopyResult: "PASS", audioRequired: true });
  const job = queueConversion({ jobId: "j1", clip: checked, sourceVerified: true, resolution: "720p", outputType: "Proxy", at: "queued" });
  const retry = recordConversionAttempt(job, "PROCESSING", "start", "worker started");
  assert.equal(retry.attempt, 1);
  assert.equal(retry.history.length, 2);
  assert.equal(job.history.length, 1);
  const failed = recordConversionAttempt(retry, "FAILED", "failed", "synthetic failure");
  assert.throws(() => recordConversionAttempt(failed, "PROCESSING", "again", "must not run"), /Terminal/);
});

test("card reuse is blocked until every clip, required copy and human sign-off pass", () => {
  const [entry] = buildClipLedger("A", "CARD-07", [clip]);
  const checked = runClapAssistant({ clip: entry, manifestResult: "PASS", sourceCopyResult: "PASS", audioRequired: true });
  const targets = requiredCopyMatrix([clip], 0, 0);
  const copies = targets.map((target, index) => copy({ copyId: `copy-${index}`, clipNumber: target.clipNumber, kind: target.kind, tier: target.tier, storageLocationId: `volume-${target.tier}` }));
  const pending = evaluateDitSignoff({ reviewerId: "", reviewedAt: "", clipLedger: [checked], manifestResult: "PASS", requiredCopies: copies, audioCount: 0, stillsCount: 0 });
  assert.equal(pending.cardSafeToReuse, false);
  const humanChecked = { ...checked, humanDisposition: "ACCEPTED" as const, humanReviewerId: "dit-reviewer-1", humanReviewedAt: "2026-11-04T11:00:00.000Z" };
  const signed = evaluateDitSignoff({ reviewerId: "dit-reviewer-1", reviewedAt: "2026-11-04T11:00:00.000Z", clipLedger: [humanChecked], manifestResult: "PASS", requiredCopies: copies, audioCount: 0, stillsCount: 0 });
  assert.equal(signed.cardSafeToReuse, true);
  const incomplete = evaluateDitSignoff({ reviewerId: "dit-reviewer-1", reviewedAt: "now", clipLedger: [humanChecked], manifestResult: "PASS", requiredCopies: copies.slice(0, 1), audioCount: 0, stillsCount: 0 });
  assert.equal(incomplete.cardSafeToReuse, false);
  const nonIndependent = copies.map((item) => ({ ...item, storageLocationId: "same-volume" }));
  assert.equal(evaluateDitSignoff({ reviewerId: "dit-reviewer-1", reviewedAt: "now", clipLedger: [humanChecked], manifestResult: "PASS", requiredCopies: nonIndependent, audioCount: 0, stillsCount: 0 }).cardSafeToReuse, false);
});

test("warnings require an explicit human disposition before sign-off", () => {
  const [entry] = buildClipLedger("A", "CARD-07", [clip]);
  const warning = { ...entry, automatedResult: "WARNING" as const, automatedReasons: ["Audio peak warning"] };
  const targets = requiredCopyMatrix([clip], 0, 0);
  const copies = targets.map((target, index) => copy({ copyId: `warning-copy-${index}`, clipNumber: target.clipNumber, kind: target.kind, tier: target.tier, storageLocationId: `volume-${target.tier}` }));
  const completeCopies = requiredCopyMatrix([clip], 0, 0).map((target, index) => copy({ copyId: `warning-copy-${index}`, clipNumber: target.clipNumber, kind: target.kind, tier: target.tier, storageLocationId: `volume-${target.tier}` }));
  assert.equal(evaluateDitSignoff({ reviewerId: "dit", reviewedAt: "now", clipLedger: [warning], manifestResult: "PASS", requiredCopies: completeCopies, audioCount: 0, stillsCount: 0 }).eligible, false);
  const accepted = { ...warning, humanDisposition: "ACCEPTED" as const, humanReviewerId: "dit", humanReviewedAt: "now" };
  assert.equal(evaluateDitSignoff({ reviewerId: "dit", reviewedAt: "now", clipLedger: [accepted], manifestResult: "PASS", requiredCopies: completeCopies, audioCount: 0, stillsCount: 0 }).eligible, true);
});

test("required copy matrix excludes BACKUP_2 converted copies but includes audio and stills", () => {
  const matrix = requiredCopyMatrix([clip], 1, 2);
  assert.equal(matrix.some((item) => item.tier === "BACKUP_2" && item.kind === "CONVERTED"), false);
  assert.equal(matrix.filter((item) => item.kind === "AUDIO").length, 3);
  assert.equal(matrix.filter((item) => item.kind === "STILLS").length, 6);
});

test("audit append helper never mutates prior history", () => {
  const original = [{ state: "FAIL" }];
  const next = appendAudit(original, { state: "PASS" });
  assert.equal(original.length, 1);
  assert.equal(next.length, 2);
});
