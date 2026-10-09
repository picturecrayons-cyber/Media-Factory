#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  deleteObject,
  sealVerifiedObject,
  signDownload,
  signUpload,
  verifyObject,
} from "../src/lib/bridge/oci-object-storage.server.ts";

const required = [
  "OCI_TENANCY_OCID",
  "OCI_USER_OCID",
  "OCI_PRIVATE_KEY",
  "OCI_REGION",
  "OCI_BUCKET_NAME",
];
const missing = required.filter((name) => !String(process.env[name] ?? "").trim());
if (missing.length) {
  console.error(`OCI_E2E_BLOCKED missing required server-only variables: ${missing.join(", ")}`);
  process.exit(2);
}

// Fingerprint is optional in the runtime because the adapter derives it from the key.
const runId = randomUUID();
const payload = Buffer.from(`CRAYONS-BRIDGE-OCI-E2E:${runId}`, "utf8");
const key = `bridge/_e2e/${Date.now()}-${runId}.txt`;
const sealedKey = `${key}.verified/${runId}`;

let sourceUploaded = false;
let sealedCreated = false;

try {
  const upload = await signUpload({ key, contentType: "text/plain" });
  assert.equal(upload.method, "PUT");
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: payload,
  });
  assert.ok(put.ok, `OCI upload failed: ${put.status}`);
  sourceUploaded = true;

  const verified = await verifyObject(key, "text/plain");
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag, "OCI source ETag missing");

  const sealed = await sealVerifiedObject(key, sealedKey, verified.etag);
  sealedCreated = true;
  assert.equal(sealed.byteSize, payload.byteLength);
  assert.ok(sealed.etag, "OCI sealed ETag missing");

  const download = await signDownload({ key: sealedKey });
  assert.equal(download.method, "GET");
  const get = await fetch(download.url);
  assert.ok(get.ok, `OCI download failed: ${get.status}`);
  const downloaded = Buffer.from(await get.arrayBuffer());
  assert.deepEqual(downloaded, payload, "OCI round-trip payload mismatch");

  console.log(JSON.stringify({
    status: "PASS",
    provider: "oracle-oci-object-storage",
    region: process.env.OCI_REGION,
    bucketConfigured: Boolean(process.env.OCI_BUCKET_NAME),
    checks: ["signed-upload", "object-verification", "immutable-seal", "signed-download", "payload-integrity"],
  }, null, 2));
} finally {
  // Delete only the unique, test-owned keys created during this run.
  if (sealedCreated) await deleteObject(sealedKey).catch(() => undefined);
  if (sourceUploaded) await deleteObject(key).catch(() => undefined);
}
