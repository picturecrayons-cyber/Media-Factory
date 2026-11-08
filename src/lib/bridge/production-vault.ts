/**
 * Studio Production Vault domain core.
 *
 * Pure, provider-neutral workflow rules. This module performs no network,
 * database, filesystem, or object-storage operations. Production and Preview
 * adapters must be added only after provider/environment identity is approved.
 */

export const CAMERA_IDS = ["A", "B", "C"] as const;
export type CameraId = (typeof CAMERA_IDS)[number];
export type StorageTier = "MASTER" | "BACKUP_1" | "BACKUP_2";
export type MediaKind = "RAW" | "AUDIO" | "STILLS" | "CONVERTED";
export type CheckResult = "PASS" | "WARNING" | "FAIL" | "NOT_CHECKED";

export interface ProductionWorkspace {
  productionId: string;
  filmName: string;
  productionNo: string;
  shootingDays: Array<{
    shootingDayId: string;
    date: string;
    cameraRolls: Array<{
      camera: CameraId;
      cardNo: string;
      clips: ClipRecord[];
    }>;
  }>;
}


export function createProductionWorkspace(workspace: ProductionWorkspace): ProductionWorkspace {
  if (!workspace.productionId.trim() || !workspace.filmName.trim() || !workspace.productionNo.trim()) {
    throw new Error("Production identity, film name and production number are required");
  }
  if (!workspace.shootingDays.length) throw new Error("At least one shooting day is required");
  const dayIds = new Set<string>();
  for (const day of workspace.shootingDays) {
    if (!day.shootingDayId.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
        Number.isNaN(Date.parse(`${day.date}T00:00:00.000Z`)) ||
        new Date(`${day.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== day.date) {
      throw new Error("Shooting day identity and ISO date are required");
    }
    if (dayIds.has(day.shootingDayId)) throw new Error("Duplicate shooting day identity");
    dayIds.add(day.shootingDayId);
    const cards = new Set<string>();
    for (const roll of day.cameraRolls) {
      if (!CAMERA_IDS.includes(roll.camera) || !roll.cardNo.trim()) throw new Error("Camera and physical Card No. are required");
      const cardKey = `${roll.camera}:${roll.cardNo}`;
      if (cards.has(cardKey)) throw new Error("Duplicate physical card in shooting day");
      cards.add(cardKey);
      const clips = new Set<string>();
      for (const clip of roll.clips) {
        if (!clip.clipNumber.trim() || clips.has(clip.clipNumber)) throw new Error("Missing or duplicate Clip Number in camera roll");
        clips.add(clip.clipNumber);
      }
    }
  }
  return {
    ...workspace,
    shootingDays: workspace.shootingDays.map((day) => ({
      ...day,
      cameraRolls: day.cameraRolls.map((roll) => ({ ...roll, clips: roll.clips.map((clip) => ({ ...clip })) })),
    })),
  };
}

export interface ClipRecord {
  clipNumber: string;
  originalFilename: string;
  originalRelativePath: string;
  byteSize: number;
  checksumSha256: string;
  hasVideo: boolean;
  hasAudio: boolean;
  durationMs: number;
  frameRate: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
}

export interface IngestManifest {
  manifestId: string;
  productionId: string;
  shootingDayId: string;
  camera: CameraId;
  cardNo: string;
  createdAt: string;
  expectedClipCount: number;
  entries: ClipRecord[];
}

export interface ClipLedgerEntry extends ClipRecord {
  camera: CameraId;
  cardNo: string;
  automatedResult: CheckResult;
  automatedReasons: string[];
  humanDisposition: "ACCEPTED" | "REJECTED" | null;
  humanReviewerId: string | null;
  humanReviewedAt: string | null;
}

export interface ManifestReconciliation {
  result: CheckResult;
  expectedCount: number;
  discoveredCount: number;
  missingClipNumbers: string[];
  unexpectedClipNumbers: string[];
  duplicateClipNumbers: string[];
  invalidEntries: string[];
}

const SHA256 = /^[a-f0-9]{64}$/i;
const SAFE_SEGMENT = /^[^/\\]+$/;

export function validateRelativeSourcePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  const parts = path.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== ".." && SAFE_SEGMENT.test(part));
}

export function buildVaultObjectKey(input: {
  filmName: string;
  productionNo: string;
  tier: StorageTier;
  date: string;
  camera?: CameraId;
  cardNo?: string;
  kind: MediaKind;
  originalRelativePath?: string;
}): string {
  const safe = (value: string) => value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  const root = `${safe(input.filmName)}_${safe(input.productionNo)}/${input.tier}/${input.date}`;
  if (input.kind === "AUDIO" || input.kind === "STILLS") {
    if (input.camera || input.cardNo || input.originalRelativePath) throw new Error("Audio and stills use shooting-day folders");
    return `${root}/${input.kind}/`;
  }
  if (!input.camera || !input.cardNo) throw new Error("Camera and physical Card No. are required");
  const cardRoot = `${root}/CAMERA_${input.camera}/${safe(input.cardNo)}`;
  if (input.kind === "CONVERTED" && input.tier === "BACKUP_2") {
    throw new Error("BACKUP_2 converted media is outside the approved initial copy policy");
  }
  if (input.kind === "CONVERTED") return `${cardRoot}/CONVERTED/`;
  if (input.originalRelativePath && !validateRelativeSourcePath(input.originalRelativePath)) {
    throw new Error("Unsafe original relative path");
  }
  return `${cardRoot}/RAW/${input.originalRelativePath ?? ""}`;
}

export function createIngestManifest(input: {
  manifestId: string;
  productionId: string;
  shootingDayId: string;
  camera: CameraId;
  cardNo: string;
  createdAt: string;
  entries: ClipRecord[];
}): IngestManifest {
  if (!input.manifestId.trim() || !input.productionId.trim() || !input.shootingDayId.trim() || !input.cardNo.trim()) {
    throw new Error("Manifest identity fields are required");
  }
  return {
    ...input,
    expectedClipCount: input.entries.length,
    entries: input.entries.map((entry) => ({ ...entry })),
  };
}

export function reconcileManifest(manifest: IngestManifest, discovered: ClipRecord[]): ManifestReconciliation {
  const manifestNumbers = manifest.entries.map((entry) => entry.clipNumber);
  const discoveredNumbers = discovered.map((entry) => entry.clipNumber);
  const duplicates = [...new Set(discoveredNumbers.filter((number, index) => discoveredNumbers.indexOf(number) !== index))];
  const expected = new Set(manifestNumbers);
  const actual = new Set(discoveredNumbers);
  const missing = [...expected].filter((number) => !actual.has(number));
  const unexpected = [...actual].filter((number) => !expected.has(number));
  const invalid = manifest.entries.flatMap((entry) => {
    const errors: string[] = [];
    if (!entry.clipNumber.trim()) errors.push("clip number missing");
    if (!entry.originalFilename.trim()) errors.push(`${entry.clipNumber}: filename missing`);
    if (!validateRelativeSourcePath(entry.originalRelativePath)) errors.push(`${entry.clipNumber}: unsafe source path`);
    if (!Number.isSafeInteger(entry.byteSize) || entry.byteSize <= 0) errors.push(`${entry.clipNumber}: invalid byte size`);
    if (!SHA256.test(entry.checksumSha256)) errors.push(`${entry.clipNumber}: invalid SHA-256`);
    return errors;
  });
  const countMatches = manifest.expectedClipCount === manifest.entries.length && manifest.expectedClipCount === discovered.length;
  const result: CheckResult =
    duplicates.length || missing.length || unexpected.length || invalid.length || !countMatches ? "FAIL" : "PASS";
  return {
    result,
    expectedCount: manifest.expectedClipCount,
    discoveredCount: discovered.length,
    missingClipNumbers: missing,
    unexpectedClipNumbers: unexpected,
    duplicateClipNumbers: duplicates,
    invalidEntries: invalid,
  };
}

export function buildClipLedger(
  camera: CameraId,
  cardNo: string,
  clips: ClipRecord[],
): ClipLedgerEntry[] {
  return clips.map((clip) => ({
    ...clip,
    camera,
    cardNo,
    automatedResult: "NOT_CHECKED",
    automatedReasons: [],
    humanDisposition: null,
    humanReviewerId: null,
    humanReviewedAt: null,
  }));
}

export interface CopyVerification {
  copyId: string;
  clipNumber: string;
  kind: MediaKind;
  tier: StorageTier;
  expectedByteSize: number;
  expectedSha256: string;
  observedByteSize: number | null;
  observedSha256: string | null;
  independentlyVerified: boolean;
  verifiedAt: string | null;
  storageLocationId: string;
  /** Trusted topology identifier (provider/account/region or offline failure domain), never a bucket-only label. */
  failureDomainId: string;
}

export function verifyStorageCopy(copy: CopyVerification): { result: CheckResult; reasons: string[] } {
  const reasons: string[] = [];
  if (!copy.copyId.trim()) reasons.push("copy identity missing");
  if (!copy.storageLocationId.trim()) reasons.push("storage location identity missing");
  if (!copy.failureDomainId.trim()) reasons.push("independent failure-domain identity missing");
  if (!Number.isSafeInteger(copy.expectedByteSize) || copy.expectedByteSize <= 0) reasons.push("expected byte size invalid");
  if (!SHA256.test(copy.expectedSha256)) reasons.push("expected checksum invalid");
  if (copy.observedByteSize === null || copy.observedSha256 === null || !copy.verifiedAt) reasons.push("destination evidence missing");
  if (copy.observedByteSize !== copy.expectedByteSize) reasons.push("byte count mismatch");
  if (copy.observedSha256?.toLowerCase() !== copy.expectedSha256.toLowerCase()) reasons.push("checksum mismatch");
  if (!copy.independentlyVerified) reasons.push("independent destination verification missing");
  return { result: reasons.length ? "FAIL" : "PASS", reasons };
}

export interface ConversionProfile {
  resolution: "720p" | "1080p";
  outputType: "Proxy" | "ProRes";
  codec: "H.264 High" | "Apple ProRes 422 LT" | "Apple ProRes 422 HQ";
  container: "MP4" | "MOV";
  width: number;
  height: number;
}

export function resolveConversionProfile(
  resolution: "720p" | "1080p",
  outputType: "Proxy" | "ProRes",
  approvedProfiles: readonly ConversionProfile[],
): ConversionProfile {
  const matches = approvedProfiles.filter((profile) =>
    profile.resolution === resolution && profile.outputType === outputType);
  if (matches.length !== 1) throw new Error("Exactly one approved codec/profile/container is required for this conversion");
  const profile = matches[0];
  const expected = resolution === "720p" ? [1280, 720] : [1920, 1080];
  if (!profile.codec.trim() || !profile.container.trim() || profile.width !== expected[0] || profile.height !== expected[1]) {
    throw new Error("Approved conversion profile does not match the selected resolution");
  }
  return { ...profile };
}

export interface ConversionCopyVerification extends CopyVerification {
  sourceSha256: string;
  probePassed: boolean;
  metadataMatchesProfile: boolean;
  qcResult: CheckResult;
}

export interface ConversionJob {
  jobId: string;
  clipNumber: string;
  sourceSha256: string;
  profile: ConversionProfile;
  state: "QUEUED" | "PROCESSING" | "RETRY_REQUIRED" | "COMPLETE" | "FAILED";
  attempt: number;
  history: Array<{ state: ConversionJob["state"]; at: string; detail: string }>;
  masterOutput: ConversionCopyVerification | null;
  backup1Output: ConversionCopyVerification | null;
}

export function queueConversion(input: {
  jobId: string;
  clip: ClipLedgerEntry;
  sourceVerified: boolean;
  resolution: "720p" | "1080p";
  outputType: "Proxy" | "ProRes";
  approvedProfiles: readonly ConversionProfile[];
  at: string;
}): ConversionJob {
  if (!input.sourceVerified || !SHA256.test(input.clip.checksumSha256) || input.clip.byteSize <= 0) {
    throw new Error("Conversion requires a verified RAW original");
  }
  if (input.clip.automatedResult === "FAIL" || input.clip.automatedResult === "NOT_CHECKED") {
    throw new Error("Conversion requires a checked, non-failing clip");
  }
  const profile = resolveConversionProfile(input.resolution, input.outputType, input.approvedProfiles);
  return {
    jobId: input.jobId,
    clipNumber: input.clip.clipNumber,
    sourceSha256: input.clip.checksumSha256,
    profile,
    state: "QUEUED",
    attempt: 0,
    history: [{ state: "QUEUED", at: input.at, detail: `Queued ${profile.codec} / ${profile.container}` }],
    masterOutput: null,
    backup1Output: null,
  };
}

export function recordConversionAttempt(
  job: ConversionJob,
  state: "PROCESSING" | "RETRY_REQUIRED" | "FAILED",
  at: string,
  detail: string,
): ConversionJob {
  if (job.state === "COMPLETE" || job.state === "FAILED") throw new Error("Terminal conversion job cannot be retried");
  return {
    ...job,
    state,
    attempt: job.attempt + (state === "PROCESSING" ? 1 : 0),
    history: [...job.history, { state, at, detail }],
  };
}

export function completeConversion(
  job: ConversionJob,
  masterOutput: ConversionCopyVerification,
  backup1Output: ConversionCopyVerification,
  at: string,
): ConversionJob {
  if (job.state !== "PROCESSING" && job.state !== "RETRY_REQUIRED") throw new Error("Conversion must be processing or retryable");
  const master = verifyStorageCopy(masterOutput);
  const backup = verifyStorageCopy(backup1Output);
  if (master.result !== "PASS" || backup.result !== "PASS") throw new Error("MASTER and BACKUP_1 outputs must independently verify");
  if (masterOutput.failureDomainId === backup1Output.failureDomainId) {
    throw new Error("MASTER and BACKUP_1 outputs must use independent failure domains");
  }
  for (const output of [masterOutput, backup1Output]) {
    if (output.sourceSha256.toLowerCase() !== job.sourceSha256.toLowerCase()) throw new Error("Derived output source lineage does not match the verified RAW clip");
    if (!output.probePassed || !output.metadataMatchesProfile || output.qcResult !== "PASS") throw new Error("Derived output probe, profile metadata and QC must pass");
  }
  if (masterOutput.kind !== "CONVERTED" || backup1Output.kind !== "CONVERTED" ||
      masterOutput.tier !== "MASTER" || backup1Output.tier !== "BACKUP_1" ||
      masterOutput.clipNumber !== job.clipNumber || backup1Output.clipNumber !== job.clipNumber) {
    throw new Error("Conversion destinations do not match the job lineage");
  }
  return {
    ...job,
    state: "COMPLETE",
    masterOutput: { ...masterOutput },
    backup1Output: { ...backup1Output },
    history: [...job.history, { state: "COMPLETE", at, detail: "Both derived outputs independently verified" }],
  };
}

export function runClapAssistant(input: {
  clip: ClipLedgerEntry;
  manifestResult: CheckResult;
  sourceCopyResult: CheckResult;
  audioRequired: boolean;
  analysisWarnings?: string[];
}): ClipLedgerEntry {
  const reasons: string[] = [];
  const warnings = [...(input.analysisWarnings ?? [])];
  const clip = input.clip;
  if (!clip.originalFilename.trim() || !validateRelativeSourcePath(clip.originalRelativePath)) reasons.push("Original filename/path missing or unsafe");
  if (!Number.isSafeInteger(clip.byteSize) || clip.byteSize <= 0) reasons.push("Source byte count is invalid");
  if (!SHA256.test(clip.checksumSha256)) reasons.push("Source SHA-256 is invalid");
  if (!clip.hasVideo) reasons.push("Video stream missing");
  if (clip.durationMs <= 0) reasons.push("Duration is missing or invalid");
  if (clip.frameRate === null || clip.frameRate <= 0 || clip.width === null || clip.height === null || !clip.codec) reasons.push("Technical stream metadata incomplete");
  if (input.manifestResult !== "PASS") reasons.push("Ingest manifest reconciliation did not pass");
  if (input.sourceCopyResult !== "PASS") reasons.push("Verified source copy is missing");
  if (input.audioRequired && !clip.hasAudio) reasons.push("Required audio stream missing");
  const fatal = reasons.some((reason) => /missing|invalid|did not pass|incomplete/i.test(reason));
  return {
    ...clip,
    automatedResult: fatal ? "FAIL" : warnings.length ? "WARNING" : "PASS",
    automatedReasons: [...reasons, ...warnings],
  };
}

export interface DitSignoff {
  reviewerId: string;
  reviewedAt: string;
  clipLedger: ClipLedgerEntry[];
  manifestResult: CheckResult;
  requiredCopies: CopyVerification[];
  audioCount: number;
  stillsCount: number;
}

export function evaluateDitSignoff(input: DitSignoff): {
  eligible: boolean;
  cardSafeToReuse: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!input.reviewerId.trim() || !input.reviewedAt) blockers.push("Human DIT reviewer and timestamp are required");
  if (input.manifestResult !== "PASS") blockers.push("Manifest reconciliation must pass");
  if (!input.clipLedger.length) blockers.push("No clips are present in the clip ledger");
  for (const clip of input.clipLedger) {
    if (clip.automatedResult === "NOT_CHECKED" || clip.automatedResult === "FAIL") blockers.push(`${clip.clipNumber}: automated check is ${clip.automatedResult}`);
    if (clip.humanDisposition !== "ACCEPTED" || !clip.humanReviewerId || !clip.humanReviewedAt) {
      blockers.push(`${clip.clipNumber}: per-clip human DIT review is incomplete`);
    }
    if (clip.humanDisposition === "REJECTED") blockers.push(`${clip.clipNumber}: human reviewer rejected the clip`);
  }
  const requiredCopyTargets = requiredCopyMatrix(input.clipLedger, input.audioCount, input.stillsCount);
  for (const target of requiredCopyTargets) {
    const matches = input.requiredCopies.filter((copy) =>
      copy.clipNumber === target.clipNumber && copy.kind === target.kind && copy.tier === target.tier);
    if (matches.length !== 1 || verifyStorageCopy(matches[0]).result !== "PASS") {
      blockers.push(`${target.clipNumber}: ${target.tier} ${target.kind} copy is not independently verified`);
    }
  }
  const byAsset = new Map<string, Set<string>>();
  for (const target of requiredCopyTargets) {
    const key = `${target.clipNumber}:${target.kind}`;
    const copy = input.requiredCopies.find((item) =>
      item.clipNumber === target.clipNumber && item.kind === target.kind && item.tier === target.tier);
    if (!copy) continue;
    const failureDomains = byAsset.get(key) ?? new Set<string>();
    if (failureDomains.has(copy.failureDomainId)) blockers.push(`${target.clipNumber}: backup destinations share a failure domain`);
    failureDomains.add(copy.failureDomainId);
    byAsset.set(key, failureDomains);
  }
  const eligible = blockers.length === 0;
  return { eligible, cardSafeToReuse: eligible, blockers };
}

/** Build the approved initial backup matrix; BACKUP_2 does not receive CONVERTED. */
export function requiredCopyMatrix(clips: ClipRecord[], audioCount: number, stillsCount: number) {
  const targets: Array<{ clipNumber: string; kind: MediaKind; tier: StorageTier }> = [];
  for (const clip of clips) {
    for (const tier of ["MASTER", "BACKUP_1", "BACKUP_2"] as const) targets.push({ clipNumber: clip.clipNumber, kind: "RAW", tier });
    targets.push({ clipNumber: clip.clipNumber, kind: "CONVERTED", tier: "MASTER" });
    targets.push({ clipNumber: clip.clipNumber, kind: "CONVERTED", tier: "BACKUP_1" });
  }
  for (let i = 0; i < audioCount; i++) for (const tier of ["MASTER", "BACKUP_1", "BACKUP_2"] as const) targets.push({ clipNumber: `AUDIO_${i + 1}`, kind: "AUDIO", tier });
  for (let i = 0; i < stillsCount; i++) for (const tier of ["MASTER", "BACKUP_1", "BACKUP_2"] as const) targets.push({ clipNumber: `STILL_${i + 1}`, kind: "STILLS", tier });
  return targets;
}

/** Immutable append-only helper for audit/result history. */
export function appendAudit<T>(history: readonly T[], event: T): T[] {
  return [...history, event];
}


/**
 * Non-secret configuration contract for three physically independent vault
 * destinations. credentialRef is a secret-manager key reference, never a key.
 */
export interface StorageDestination {
  tier: StorageTier;
  provider: string;
  accountId: string;
  region: string;
  container: string;
  credentialRef: string;
}

export function validateStorageTopology(
  destinations: readonly StorageDestination[],
): Array<StorageDestination & { failureDomainId: string; storageLocationId: string }> {
  const required: readonly StorageTier[] = ["MASTER", "BACKUP_1", "BACKUP_2"];
  if (destinations.length !== required.length) {
    throw new Error("Exactly three configured storage destinations are required");
  }
  const tiers = new Set<StorageTier>();
  const failureDomains = new Set<string>();
  const locations = new Set<string>();
  const normalized = destinations.map((destination) => {
    for (const [field, value] of Object.entries(destination)) {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Storage destination ${field} is required`);
      }
    }
    if (!required.includes(destination.tier)) throw new Error("Unsupported storage tier");
    if (tiers.has(destination.tier)) throw new Error("Duplicate storage tier");
    tiers.add(destination.tier);
    const failureDomainId = [
      destination.provider,
      destination.accountId,
      destination.region,
    ].map((value) => value.trim().toLowerCase()).join("/");
    const storageLocationId = [
      failureDomainId,
      destination.container.trim().toLowerCase(),
    ].join("/");
    if (failureDomains.has(failureDomainId)) {
      throw new Error("Storage destinations must use three independent provider/account/region failure domains");
    }
    if (locations.has(storageLocationId)) throw new Error("Duplicate storage location");
    failureDomains.add(failureDomainId);
    locations.add(storageLocationId);
    return { ...destination, failureDomainId, storageLocationId };
  });
  for (const tier of required) {
    if (!tiers.has(tier)) throw new Error(`Missing storage destination for ${tier}`);
  }
  return normalized.sort((a, b) => required.indexOf(a.tier) - required.indexOf(b.tier));
}
