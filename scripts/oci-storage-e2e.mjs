#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const required = [
  "OCI_TENANCY_OCID",
  "OCI_USER_OCID",
  "OCI_FINGERPRINT",
  "OCI_PRIVATE_KEY",
  "OCI_REGION",
  "OCI_NAMESPACE",
  "OCI_BUCKET_NAME",
];

const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length) {
  console.error(`STORAGE_E2E_BLOCKED missing: ${missing.join(", ")}`);
  process.exit(2);
}

const {
  signUpload,
  verifyObject,
  sealVerifiedObject,
  signDownload,
  deleteObject,
} = await import("../src/lib/bridge/oci-object-storage.server.ts");

const runId = randomUUID();
const prefix = `bridge-e2e/${runId}`;
const sourceKey = `${prefix}/source.bin`;
const sealedKey = `${prefix}/sealed.bin`;
const payload = Buffer.from(`CRAYONS_BRIDGE_OCI_E2E ${runId}`, "utf8");
const contentType = "application/octet-stream";
let sourceMayExist = false;
let sealedMayExist = false;
let failed = false;

async function removeAndConfirmAbsent(key) {
  // First DELETE removes the object if it exists; second DELETE must observe 404.
  await deleteObject(key);
  const confirmation = await deleteObject(key);
  assert.equal(confirmation.deleted, false, `OCI object still exists after cleanup: ${key}`);
}

try {
  console.log("1/5 isolated random object key: PASS");

  const upload = await signUpload({ key: sourceKey, contentType });
  sourceMayExist = true;
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: payload,
  });
  if (!put.ok) throw new Error(`OCI PUT failed (${put.status})`);
  console.log("2/5 OCI signed upload: PASS");

  const verified = await verifyObject(sourceKey, contentType);
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag, "OCI HEAD response must include ETag");
  console.log("3/5 OCI HEAD/ETag verification: PASS");

  sealedMayExist = true;
  const sealed = await sealVerifiedObject(sourceKey, sealedKey, verified.etag);
  assert.equal(sealed.byteSize, payload.byteLength);
  assert.ok(sealed.etag, "sealed object must include ETag");

  const download = await signDownload({ key: sealedKey });
  const get = await fetch(download.url);
  if (!get.ok) throw new Error(`OCI signed GET failed (${get.status})`);
  const downloaded = Buffer.from(await get.arrayBuffer());
  assert.deepEqual(downloaded, payload);
  console.log("4/5 sealed copy + byte-for-byte download: PASS");
} catch (error) {
  failed = true;
  console.error("STORAGE_E2E_FAILED", error instanceof Error ? error.message : String(error));
} finally {
  const cleanupErrors = [];
  if (sealedMayExist) {
    try {
      await removeAndConfirmAbsent(sealedKey);
    } catch (error) {
      cleanupErrors.push(`sealed object cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (sourceMayExist) {
    try {
      await removeAndConfirmAbsent(sourceKey);
    } catch (error) {
      cleanupErrors.push(`source object cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (cleanupErrors.length) {
    failed = true;
    for (const message of cleanupErrors) console.error("STORAGE_E2E_CLEANUP_FAILED", message);
  } else {
    console.log("5/5 cleanup verified (test-created keys only): PASS");
  }

  if (!failed) {
    console.log(JSON.stringify({
      status: "PASS",
      runId,
      byteSize: payload.byteLength,
      byteComparison: "equal",
      cleanupVerified: true,
      databaseWrites: false,
    }));
  }
  if (failed) process.exitCode = 1;
}
