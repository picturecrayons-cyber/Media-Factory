import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  deleteObject,
  sealVerifiedObject,
  signDownload,
  signUpload,
  verifyObject,
} from "../src/lib/bridge/oci-object-storage.server.ts";
import { runWithCleanup } from "./oci-e2e-cleanup.mjs";
import { assertNonProductionOciE2E } from "./oci-e2e-environment.mjs";

// This guard prevents accidental execution against an unconfirmed target.
assertNonProductionOciE2E();

const runId = randomUUID();
const payload = Buffer.from(`CRAYONS-BRIDGE-OCI-E2E:${runId}`, "utf8");
const key = `bridge/_e2e/${Date.now()}-${runId}.txt`;
const sealedKey = `${key}.verified/${runId}`;

await runWithCleanup(
  async () => {
    const upload = await signUpload({ key, contentType: "text/plain" });
    assert.equal(upload.method, "PUT");
    const put = await fetch(upload.url, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: payload,
    });
    assert.ok(put.ok, `OCI upload failed: ${put.status}`);

    const verified = await verifyObject(key, "text/plain");
    assert.equal(verified.byteSize, payload.byteLength);
    assert.ok(verified.etag, "OCI source ETag missing");

    const sealed = await sealVerifiedObject(key, sealedKey, verified.etag);
    assert.equal(sealed.byteSize, payload.byteLength);
    assert.ok(sealed.etag, "OCI sealed ETag missing");

    const download = await signDownload({ key: sealedKey });
    assert.equal(download.method, "GET");
    const get = await fetch(download.url);
    assert.ok(get.ok, `OCI download failed: ${get.status}`);
    const downloaded = Buffer.from(await get.arrayBuffer());
    assert.deepEqual(downloaded, payload, "OCI round-trip payload mismatch");
  },
  // Attempt deletion for both unique keys even if a PUT/copy succeeded remotely
  // but its response was lost. deleteObject treats 404 as already-cleaned.
  () => [
    {
      label: `Failed to delete sealed OCI test object ${sealedKey}`,
      run: () => deleteObject(sealedKey),
    },
    {
      label: `Failed to delete source OCI test object ${key}`,
      run: () => deleteObject(key),
    },
  ],
);

console.log(JSON.stringify({
  status: "PASS",
  provider: "oracle-oci-object-storage",
  region: process.env.OCI_REGION,
  bucketConfigured: Boolean(process.env.OCI_BUCKET_NAME),
  sourceKey: key,
  sealedKey,
  byteSize: payload.byteLength,
  checks: ["signed-upload", "object-verification", "immutable-seal", "signed-download", "payload-integrity", "cleanup"],
}, null, 2));
