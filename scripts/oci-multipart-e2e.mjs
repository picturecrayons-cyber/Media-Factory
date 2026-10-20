import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { abortMultipartUpload, commitMultipartUpload, createMultipartPartRequest, deleteObject, initiateMultipartUpload, sealVerifiedObject, signDownload, verifyObject } from "../src/lib/bridge/oci-object-storage.server.ts";

function requirePreviewOrigin(value) {
  if (!value) throw new Error("BRIDGE_E2E_BROWSER_ORIGIN is required for browser CORS/ETag verification");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BRIDGE_E2E_BROWSER_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment");
  }
  if (!url.hostname.endsWith(".vercel.app") || url.hostname === "vercel.app") {
    throw new Error("Refusing browser E2E unless BRIDGE_E2E_BROWSER_ORIGIN is a non-production Vercel preview origin");
  }
  return url.origin;
}

// Synthetic test payload only; never reads or uploads a production film master.
const browserOrigin = requirePreviewOrigin(process.env.BRIDGE_E2E_BROWSER_ORIGIN);
const runId = randomUUID();
const chunkSize = 16 * 1024 * 1024;
const prefix = "CRAYONS-BRIDGE-OCI-MULTIPART-E2E:" + runId;
const payload = Buffer.alloc(chunkSize + 1, 0x43);
payload.write(prefix, 0, "utf8");
const key = "bridge/_e2e/multipart-" + Date.now() + "-" + runId + ".bin";
const sealedKey = key + ".verified/" + runId;
let uploadId;
let sourceCommitted = false;
let result;
let browser;
try {
  const upload = await initiateMultipartUpload({ key, contentType: "application/octet-stream" });
  uploadId = upload.uploadId;
  const parts = [];
  const chunks = [payload.subarray(0, chunkSize), payload.subarray(chunkSize)];

  // First part runs in a real browser from the preview application's origin. This
  // catches OCI CORS/preflight failures and missing Access-Control-Expose-Headers: ETag.
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(browserOrigin, { waitUntil: "domcontentloaded", timeout: 30_000 });
  assert.equal(new URL(page.url()).origin, browserOrigin, "Browser did not remain on the configured preview origin");

  for (const [index, part] of chunks.entries()) {
    const sha256 = createHash("sha256").update(part).digest("base64");
    const signed = await createMultipartPartRequest({ key, uploadId, partNum: index + 1, byteSize: part.byteLength, sha256 });
    let etag;
    if (index === 0) {
      etag = await page.evaluate(async ({ url, headers, size, prefixText }) => {
        const body = new Uint8Array(size);
        body.fill(0x43);
        body.set(new TextEncoder().encode(prefixText), 0);
        return await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", url);
          for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
          xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(new Error("Browser OCI part upload failed (" + xhr.status + ")"));
              return;
            }
            const exposedEtag = xhr.getResponseHeader("etag");
            if (!exposedEtag || !exposedEtag.trim()) {
              reject(new Error("Browser could not read OCI ETag; verify CORS expose-headers includes ETag"));
              return;
            }
            resolve(exposedEtag.trim());
          };
          xhr.onerror = () => reject(new Error("Browser OCI request failed CORS/network validation"));
          xhr.onabort = () => reject(new Error("Browser OCI request was aborted"));
          xhr.send(body);
        });
      }, { url: signed.url, headers: signed.headers, size: part.byteLength, prefixText: prefix });
    } else {
      const response = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: part });
      assert.ok(response.ok, "OCI multipart part " + (index + 1) + " failed: " + response.status);
      etag = response.headers.get("etag")?.trim();
      assert.ok(etag, "OCI multipart part " + (index + 1) + " did not return an ETag");
    }
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
  result = {
    status: "PASS",
    provider: "oracle-oci-object-storage",
    region: process.env.OCI_REGION,
    browserOrigin,
    byteSize: payload.byteLength,
    partCount: parts.length,
    checks: ["multipart-initiation", "browser-origin-cors-preflight", "browser-etag-exposure", "part-etags", "multipart-completion-manifest", "size-verification", "immutable-seal", "download-integrity", "cleanup"],
  };
} finally {
  if (browser) await browser.close().catch(() => undefined);
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
