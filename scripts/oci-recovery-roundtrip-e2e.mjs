#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

if (process.env.BRIDGE_E2E_TARGET !== "staging") {
  console.error("OCI_RECOVERY_E2E_BLOCKED: BRIDGE_E2E_TARGET must be exactly staging");
  process.exit(2);
}

const required = [
  "OCI_TENANCY_OCID",
  "OCI_USER_OCID",
  "OCI_FINGERPRINT",
  "OCI_PRIVATE_KEY",
  "OCI_REGION",
  "OCI_NAMESPACE",
  "OCI_BUCKET_NAME",
  "OCI_RECOVERY_BUCKET_NAME",
];
const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length) {
  console.error(`OCI_RECOVERY_E2E_BLOCKED missing: ${missing.join(", ")}`);
  process.exit(2);
}
const primaryBucket = process.env.OCI_BUCKET_NAME.trim();
const recoveryBucket = process.env.OCI_RECOVERY_BUCKET_NAME.trim();
if (primaryBucket === recoveryBucket) {
  console.error("OCI_RECOVERY_E2E_BLOCKED: Primary and Recovery buckets must be different");
  process.exit(2);
}

const {
  signUpload,
  verifyObject,
  sealVerifiedObject,
  verifyObjectSha256,
  deleteObject,
} = await import("../src/lib/bridge/oci-object-storage.server.ts");

const runId = randomUUID();
const prefix = `bridge-e2e/recovery-roundtrip/${new Date().toISOString().slice(0, 10)}/${runId}`;
const sourceKey = `${prefix}/primary.bin`;
const recoveryKey = `${prefix}/recovery.bin`;
const payload = Buffer.from(`CRAYONS BRIDGE OCI RECOVERY E2E ${runId}\n`, "utf8");
const sha256 = createHash("sha256").update(payload).digest("hex");
let sourceCreated = false;
// Track the unique destination key before issuing the copy: OCI may complete the
// copy even if the helper later fails while waiting or verifying the destination.
let recoveryCopyAttempted = false;

try {
  console.log("1/6 create isolated synthetic object: START");
  const upload = await signUpload({
    key: sourceKey,
    contentType: "application/octet-stream",
  });
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: payload,
    redirect: "error",
  });
  if (!put.ok) throw new Error(`Primary upload failed (${put.status})`);
  sourceCreated = true;
  console.log("1/6 create isolated synthetic object: PASS");

  console.log("2/6 verify Primary object HEAD: START");
  const primary = await verifyObject(sourceKey, "application/octet-stream");
  assert.equal(primary.byteSize, payload.byteLength);
  console.log("2/6 verify Primary object HEAD: PASS");

  console.log("3/6 copy to distinct Recovery bucket: START");
  recoveryCopyAttempted = true;
  const copied = await sealVerifiedObject(
    sourceKey,
    recoveryKey,
    primary.etag,
    undefined,
    recoveryBucket,
  );
  assert.equal(copied.byteSize, payload.byteLength);
  console.log("3/6 copy to distinct Recovery bucket: PASS");

  console.log("4/6 verify Recovery object HEAD: START");
  const recoveryHead = await verifyObject(
    recoveryKey,
    "application/octet-stream",
    recoveryBucket,
  );
  assert.equal(recoveryHead.byteSize, payload.byteLength);
  console.log("4/6 verify Recovery object HEAD: PASS");

  console.log("5/6 stream Recovery bytes and compare SHA-256: START");
  const checksum = await verifyObjectSha256(
    recoveryKey,
    sha256,
    payload.byteLength,
    recoveryBucket,
  );
  assert.equal(checksum.verified, true);
  assert.equal(checksum.sha256, sha256);
  console.log("5/6 stream Recovery bytes and compare SHA-256: PASS");

  console.log(JSON.stringify({
    status: "PASS",
    runId,
    primaryBucket,
    recoveryBucket,
    sourceKey,
    recoveryKey,
    byteSize: payload.byteLength,
    sha256,
    recoveryVerified: true,
  }));
} catch (error) {
  console.error("OCI_RECOVERY_E2E_FAILED", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  console.log("6/6 remove only this run's synthetic objects: START");
  const cleanupErrors = [];
  if (recoveryCopyAttempted) {
    try { await deleteObject(recoveryKey, recoveryBucket); }
    catch (error) { cleanupErrors.push(`Recovery cleanup failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (sourceCreated) {
    try { await deleteObject(sourceKey); }
    catch (error) { cleanupErrors.push(`Primary cleanup failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (cleanupErrors.length) {
    console.error("OCI_RECOVERY_E2E_CLEANUP_WARNING", cleanupErrors.join("; "));
    process.exitCode = 1;
  } else {
    console.log("6/6 remove only this run's synthetic objects: PASS");
  }
}
