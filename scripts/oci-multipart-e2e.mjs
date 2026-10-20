import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { abortMultipartUpload, commitMultipartUpload, createMultipartPartRequest, deleteObject, initiateMultipartUpload, sealVerifiedObject, signDownload, verifyObject } from "../src/lib/bridge/oci-object-storage.server.ts";

// Synthetic test payload only; never reads or uploads a production film master.
const runId = randomUUID();
const chunkSize = 16 * 1024 * 1024;
const payload = Buffer.alloc(chunkSize + 1, 0x43);
payload.write("CRAYONS-BRIDGE-OCI-MULTIPART-E2E:" + runId, 0, "utf8");
const key = "bridge/_e2e/multipart-" + Date.now() + "-" + runId + ".bin";
const sealedKey = key + ".verified/" + runId;
let uploadId;
let sourceCommitted = false;
let result;
try {
  const upload = await initiateMultipartUpload({ key, contentType: "application/octet-stream" });
  uploadId = upload.uploadId;
  const parts = [];
  for (const [index, part] of [payload.subarray(0, chunkSize), payload.subarray(chunkSize)].entries()) {
    const sha256 = createHash("sha256").update(part).digest("base64");
    const signed = await createMultipartPartRequest({ key, uploadId, partNum: index + 1, byteSize: part.byteLength, sha256 });
    const response = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: part });
    assert.ok(response.ok, "OCI multipart part " + (index + 1) + " failed: " + response.status);
    const etag = response.headers.get("etag")?.trim();
    assert.ok(etag, "OCI multipart part " + (index + 1) + " did not return an ETag");
    parts.push({ partNum: index + 1, etag });
  }
  await commitMultipartUpload({ key, uploadId, parts });
  sourceCommitted = true;
  const verified = await verifyObject(key, "application/octet-stream");
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag, "Committed multipart object ETag missing");
  const sealed = await sealVerifiedObject(key, sealedKey, verified.etag);
  assert.equal(sealed.byteSize, payload.byteLength);
  assert.ok(sealed.etag, "Sealed object ETag missing");
  const download = await signDownload({ key: sealedKey });
  const response = await fetch(download.url);
  assert.ok(response.ok, "OCI sealed-object download failed: " + response.status);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), payload);
  result = { status: "PASS", provider: "oracle-oci-object-storage", region: process.env.OCI_REGION, byteSize: payload.byteLength, partCount: parts.length, checks: ["multipart-initiation", "part-etags", "multipart-completion-manifest", "size-verification", "immutable-seal", "download-integrity", "cleanup"] };
} finally {
  // Attempt every cleanup action. A failed cleanup must fail the workflow rather
  // than being silently swallowed and leaving synthetic objects or multipart state.
  const cleanupErrors = [];
  if (uploadId && !sourceCommitted) {
    try {
      await abortMultipartUpload({ key, uploadId });
    } catch (error) {
      cleanupErrors.push("multipart abort: " + (error instanceof Error ? error.message : String(error)));
    }
  }
  for (const cleanupKey of [sealedKey, key]) {
    try {
      await deleteObject(cleanupKey);
    } catch (error) {
      cleanupErrors.push("object cleanup: " + (error instanceof Error ? error.message : String(error)));
    }
  }
  if (cleanupErrors.length) {
    console.error("OCI E2E cleanup did not complete:", cleanupErrors.join("; "));
    throw new Error("OCI E2E cleanup failed");
  }
}
console.log(JSON.stringify(result, null, 2));
