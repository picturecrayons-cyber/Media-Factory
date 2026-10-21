import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  deleteObject,
  sealVerifiedObject,
  signDownload,
  signUpload,
  verifyObject,
} from "../src/lib/bridge/oci-object-storage.server.ts";

function requirePreviewBucket() {
  const bucket = String(process.env.OCI_BUCKET_NAME ?? "").trim();
  if (!bucket) {
    throw new Error("OCI_BUCKET_NAME is required for OCI E2E verification");
  }
  const previewBucket = String(process.env.BRIDGE_PREVIEW_OCI_BUCKET ?? "").trim();
  if (previewBucket && bucket !== previewBucket) {
    throw new Error(`OCI_BUCKET_NAME (${bucket}) does not match allowlisted BRIDGE_PREVIEW_OCI_BUCKET (${previewBucket})`);
  }
  if (process.env.BRIDGE_RELEASE_GATE_ENV === "production" || /prod(uction)?/i.test(bucket)) {
    throw new Error("Refusing OCI E2E on production-designated bucket or environment");
  }
  return bucket;
}

const bucket = requirePreviewBucket();
const runId = randomUUID();
const payload = Buffer.from(`CRAYONS-BRIDGE-OCI-E2E:${runId}`, "utf8");
const key = `bridge/_e2e/${Date.now()}-${runId}.txt`;
const sealedKey = `${key}.verified/${runId}`;

let sourceUploaded = false;
let sealedCreated = false;
let result;

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

  result = {
    status: "PASS",
    provider: "oracle-oci-object-storage",
    region: process.env.OCI_REGION,
    bucketConfigured: Boolean(bucket),
    sourceKey: key,
    sealedKey,
    byteSize: payload.byteLength,
    checks: ["signed-upload", "object-verification", "immutable-seal", "signed-download", "payload-integrity", "cleanup"],
  };
} finally {
  const cleanupErrors = [];
  if (sealedCreated) {
    try {
      await deleteObject(sealedKey);
    } catch (error) {
      cleanupErrors.push(`delete sealedKey (${sealedKey}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (sourceUploaded) {
    try {
      await deleteObject(key);
    } catch (error) {
      cleanupErrors.push(`delete sourceKey (${key}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (cleanupErrors.length > 0) {
    console.error("OCI E2E cleanup did not complete:", cleanupErrors.join("; "));
    throw new Error(`OCI E2E cleanup failed: ${cleanupErrors.join("; ")}`);
  }
}

console.log(JSON.stringify(result, null, 2));
