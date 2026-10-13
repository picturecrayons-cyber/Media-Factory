import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  deleteObject,
  sealVerifiedObject,
  signDownload,
  signUpload,
  verifyObject,
} from "../src/lib/bridge/oci-object-storage.server.ts";

function previewBaseUrl() {
  const raw = process.env.BRIDGE_PREVIEW_URL?.trim();
  if (!raw) throw new Error("BRIDGE_PREVIEW_URL is required; refusing to guess a target.");
  const url = new URL(raw);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) {
    throw new Error("Preview E2E only accepts an HTTPS, deployment-specific *.vercel.app URL.");
  }
  if (/^(bridge\.crayonspictures\.(in|com)|crayonsloop\.(in|com)|www\.)/i.test(url.hostname)) {
    throw new Error("Production/custom domains are not allowed for this Preview-only test.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BRIDGE_PREVIEW_URL must be an origin only, without path, query, or fragment.");
  }
  return url.origin;
}

function isObjectNotFound(error) {
  // verifyObject wraps OCI HEAD failures with this operation and HTTP status.
  // Do not treat auth, network, configuration, or any other failure as absence.
  return error instanceof Error &&
    /^OCI object verification failed \(404\)(?::|\.)/.test(error.message);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; no test was executed.`);
  return value;
}

const previewUrl = previewBaseUrl();
const titleId = required("BRIDGE_PREVIEW_TITLE_ID");
const ownerUserId = required("BRIDGE_PREVIEW_OWNER_USER_ID");
assert.match(titleId, /^[A-Za-z0-9_-]{1,128}$/, "BRIDGE_PREVIEW_TITLE_ID must be a single safe path segment.");
assert.match(ownerUserId, /^[A-Za-z0-9_-]{1,128}$/, "BRIDGE_PREVIEW_OWNER_USER_ID must be a single safe path segment.");
const accessToken = required("BRIDGE_PREVIEW_ACCESS_TOKEN");
const invalidToken = "invalid-preview-e2e-token";
const runId = randomUUID();
const payload = Buffer.from(`CRAYONS-BRIDGE-PREVIEW-OCI-E2E:${runId}`, "utf8");
const payloadSha256 = createHash("sha256").update(payload).digest("hex");
const sourceKey = `bridge/${ownerUserId}/${titleId}/e2e/${Date.now()}-${runId}.txt`;
const sealedKey = `${sourceKey}.verified/${runId}`;
let sourceUploaded = false;
let sealedCreated = false;

try {
  // First prove the Preview endpoint denies both anonymous and invalid sessions.
  const anonymous = await fetch(`${previewUrl}/api/loop/media?titleId=${encodeURIComponent(titleId)}&mediaType=master`);
  assert.equal(anonymous.status, 401, `Anonymous playback request must be denied (received ${anonymous.status}).`);

  const invalidSession = await fetch(`${previewUrl}/api/loop/media?titleId=${encodeURIComponent(titleId)}&mediaType=master`, {
    headers: { authorization: `Bearer ${invalidToken}` },
  });
  assert.equal(invalidSession.status, 401, `Invalid session must be denied (received ${invalidSession.status}).`);

  // Exercise the real OCI upload -> HEAD verification -> immutable copy -> signed GET round-trip.
  const upload = await signUpload({ key: sourceKey, contentType: "text/plain" });
  assert.equal(upload.method, "PUT");
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: payload,
  });
  assert.ok(put.ok, `OCI upload failed with HTTP ${put.status}`);
  sourceUploaded = true;

  const verified = await verifyObject(sourceKey, "text/plain");
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag, "OCI source ETag missing");

  const sealed = await sealVerifiedObject(sourceKey, sealedKey, verified.etag);
  sealedCreated = true;
  assert.equal(sealed.byteSize, payload.byteLength);
  assert.ok(sealed.etag, "OCI sealed ETag missing");

  const download = await signDownload({ key: sealedKey });
  assert.equal(download.method, "GET");
  const get = await fetch(download.url);
  assert.ok(get.ok, `OCI signed download failed with HTTP ${get.status}`);
  const downloadedBytes = Buffer.from(await get.arrayBuffer());
  const downloadedSha256 = createHash("sha256").update(downloadedBytes).digest("hex");
  assert.equal(downloadedBytes.byteLength, payload.byteLength, "OCI downloaded byte length mismatch");
  assert.equal(downloadedSha256, payloadSha256, "OCI round-trip payload SHA-256 mismatch");
  assert.deepEqual(downloadedBytes, payload, "OCI round-trip payload content mismatch");

  // A valid user session must pass Bridge's publication, territory/window, TVOD,
  // rental-entitlement and asset gates before a short-lived stream URL is issued.
  const authorized = await fetch(
    `${previewUrl}/api/loop/media?titleId=${encodeURIComponent(titleId)}&mediaType=master`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  assert.equal(authorized.status, 200, `Authorized playback should pass only for a valid, entitled title (received ${authorized.status}).`);
  const response = await authorized.json();
  assert.equal(response.success, true);
  assert.equal(response.storageAuthority, "bridge-oci");
  assert.equal(response.expiresInSeconds, 300);
  assert.ok(typeof response.streamUrl === "string" && response.streamUrl.startsWith("https://"));
  // Do not print the signed URL, bearer token, or object credentials.
  const stream = await fetch(response.streamUrl);
  assert.ok(stream.ok, `Authorized OCI stream fetch failed with HTTP ${stream.status}`);
  assert.ok((await stream.arrayBuffer()).byteLength > 0, "Authorized stream returned an empty object");

  console.log(JSON.stringify({
    status: "PASS",
    environment: "preview",
    provider: "oracle-oci-object-storage",
    checks: [
      "anonymous-playback-denied",
      "invalid-session-denied",
      "signed-upload",
      "object-head-verification",
      "immutable-seal",
      "signed-download-integrity",
      "sha256-payload-verified",
      "bridge-publication-and-entitlement-authorization",
      "authorized-playback",
    ],
    byteSize: payload.byteLength,
    sha256: payloadSha256,
    previewHost: new URL(previewUrl).hostname,
  }, null, 2));
} finally {
  const cleanupFailures = [];
  if (sealedCreated) {
    try {
      await deleteObject(sealedKey);
      try {
        await verifyObject(sealedKey);
        cleanupFailures.push(`sealed object ${sealedKey} still exists after deletion`);
      } catch (error) {
        if (!isObjectNotFound(error)) {
          cleanupFailures.push(
            `sealed object absence verification failed for ${sealedKey}: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }
    } catch (error) {
      cleanupFailures.push(`sealed object cleanup failed for ${sealedKey}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  if (sourceUploaded) {
    try {
      await deleteObject(sourceKey);
      try {
        await verifyObject(sourceKey);
        cleanupFailures.push(`source object ${sourceKey} still exists after deletion`);
      } catch (error) {
        if (!isObjectNotFound(error)) {
          cleanupFailures.push(
            `source object absence verification failed for ${sourceKey}: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }
    } catch (error) {
      cleanupFailures.push(`source object cleanup failed for ${sourceKey}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  if (cleanupFailures.length) {
    console.error("OCI E2E cleanup incomplete:", cleanupFailures.join("; "));
    process.exitCode = 1;
  } else if (sourceUploaded || sealedCreated) {
    console.log("OCI E2E post-cleanup: confirmed both test objects absent from bucket.");
  }
}

