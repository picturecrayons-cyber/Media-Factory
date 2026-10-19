import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  deleteObject,
  initiateMultipartUpload,
  sealVerifiedObject,
  signDownload,
  verifyObject,
} from "../src/lib/bridge/oci-object-storage.server.ts";

// Dedicated synthetic test payload; never reads or uploads a production film master.
const runId = randomUUID();
const chunkSize = 16 * 1024 * 1024;
const payload = Buffer.alloc(chunkSize + 1, 0x43);
payload.write(`CRAYONS-BRIDGE-OCI-MULTIPART-E2E:${runId}`, 0, "utf8");
const key = `bridge/_e2e/multipart-${Date.now()}-${runId}.bin`;
const sealedKey = `${key}.verified/${runId}`;
let accessUri;
let sourceCommitted = false;
let sealedCreated = false;

try {
  const upload = await initiateMultipartUpload({ key, contentType: "application/octet-stream", expiresIn: 900 });
  accessUri = upload.accessUri;
  const etags = [];
  for (const [index, part] of [
    payload.subarray(0, chunkSize),
    payload.subarray(chunkSize),
  ].entries()) {
    const response = await fetch(new URL(String(index + 1), accessUri), {
      method: "PUT",
      body: part,
    });
    assert.ok(response.ok, `OCI multipart part ${index + 1} failed: ${response.status}`);
    const etag = response.headers.get("etag")?.replaceAll('"', "").trim();
    assert.ok(etag, `OCI multipart part ${index + 1} did not return an ETag`);
    etags.push(etag);
  }
  assert.equal(etags.length, 2);
  const completion = await fetch(accessUri, { method: "POST" });
  assert.ok(completion.ok, `OCI multipart completion failed: ${completion.status}`);
  sourceCommitted = true;

  const verified = await verifyObject(key, "application/octet-stream");
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag, "Committed multipart object ETag missing");
  const sealed = await sealVerifiedObject(key, sealedKey, verified.etag);
  sealedCreated = true;
  assert.equal(sealed.byteSize, payload.byteLength);
  assert.ok(sealed.etag, "Sealed object ETag missing");

  const download = await signDownload({ key: sealedKey });
  const response = await fetch(download.url);
  assert.ok(response.ok, `OCI sealed-object download failed: ${response.status}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), payload);

  console.log(JSON.stringify({
    status: "PASS",
    provider: "oracle-oci-object-storage",
    region: process.env.OCI_REGION,
    bucketConfigured: Boolean(process.env.OCI_BUCKET_NAME),
    sourceKey: key,
    sealedKey,
    byteSize: payload.byteLength,
    partCount: etags.length,
    checks: ["multipart-initiation", "part-etags", "multipart-completion", "size-verification", "immutable-seal", "download-integrity"],
  }, null, 2));
} finally {
  if (accessUri && !sourceCommitted) await fetch(accessUri, { method: "DELETE" }).catch(() => undefined);
  if (sealedCreated) await deleteObject(sealedKey).catch(() => undefined);
  if (sourceCommitted) await deleteObject(key).catch(() => undefined);
}
