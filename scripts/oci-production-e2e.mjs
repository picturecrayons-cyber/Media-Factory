#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  errorText,
  requireEnvironment,
  requireExplicitFlag,
} from "./oci-e2e-safety.mjs";

const required = [
  "OCI_TENANCY_OCID",
  "OCI_USER_OCID",
  "OCI_FINGERPRINT",
  "OCI_PRIVATE_KEY",
  "OCI_REGION",
  "OCI_NAMESPACE",
  "OCI_BUCKET_NAME",
];

try {
  requireExplicitFlag(
    "--confirm-oci-write",
    "OCI round-trip E2E writes temporary objects to the configured bucket and requires explicit operator approval",
  );
  requireEnvironment(required);
} catch (error) {
  console.error("OCI_PRODUCTION_E2E_BLOCKED", errorText(error));
  process.exit(2);
}

const runId = randomUUID();
const payload = Buffer.from(`CRAYONS-BRIDGE-OCI-E2E:${runId}`, "utf8");
const key = `bridge/_e2e/${Date.now()}-${runId}.txt`;
const sealedKey = `${key}.verified/${runId}`;

let sourceUploaded = false;
let sealAttempted = false;
let sealedCreated = false;
let operationFailed = false;
let storage;

try {
  storage = await import("../src/lib/bridge/oci-object-storage.server.ts");

  const upload = await storage.signUpload({ key, contentType: "text/plain" });
  assert.equal(upload.method, "PUT");
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: payload,
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) throw new Error(`OCI upload failed (${put.status}).`);
  sourceUploaded = true;

  const verified = await storage.verifyObject(key, "text/plain");
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag, "OCI source ETag missing");

  sealAttempted = true;
  const sealed = await storage.sealVerifiedObject(key, sealedKey, verified.etag);
  sealedCreated = true;
  assert.equal(sealed.byteSize, payload.byteLength);
  assert.ok(sealed.etag, "OCI sealed ETag missing");

  const download = await storage.signDownload({ key: sealedKey });
  assert.equal(download.method, "GET");
  const get = await fetch(download.url, { signal: AbortSignal.timeout(120_000) });
  if (!get.ok) throw new Error(`OCI signed download failed (${get.status}).`);
  const downloaded = Buffer.from(await get.arrayBuffer());
  assert.deepEqual(downloaded, payload, "OCI round-trip payload mismatch");

  console.log(JSON.stringify({
    status: "PASS",
    provider: "oracle-oci-object-storage",
    region: process.env.OCI_REGION,
    sourceKey: key,
    sealedKey,
    byteSize: payload.byteLength,
    checks: ["signed-upload", "object-verification", "immutable-seal", "signed-download", "payload-integrity"],
  }, null, 2));
} catch (error) {
  operationFailed = true;
  const message = errorText(error);
  console.error("OCI_PRODUCTION_E2E_FAILED", message);
  if (/InsufficientServicePermissions/i.test(message)) {
    console.error("OPERATOR_ACTION: ask the OCI administrator to verify least-privilege object-storage service-principal copy permissions for the configured source/destination buckets and compartments.");
  }
  process.exitCode = 1;
} finally {
  if (storage) {
    const cleanupTargets = [];
    if (sealAttempted || sealedCreated) cleanupTargets.push(sealedKey);
    if (sourceUploaded) cleanupTargets.push(key);

    const cleanupErrors = [];
    for (const objectKey of cleanupTargets) {
      try {
        await storage.deleteObject(objectKey);
      } catch (error) {
        cleanupErrors.push(`${objectKey}: ${errorText(error)}`);
      }
    }

    if (cleanupErrors.length) {
      console.error("OCI_E2E_CLEANUP_REQUIRED", cleanupErrors.join("; "));
      process.exitCode = 1;
    }
  }
  if (operationFailed) {
    console.error("OCI_E2E_RESULT: FAIL; do not promote based on this run.");
  }
}
