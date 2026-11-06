import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  assertMultipartSessionSigningReady,
  signMultipartSession,
  verifyMultipartSession,
} from "./multipart-session.server.ts";

const secretKey = "BRIDGE_UPLOAD_SESSION_SECRET";
const regionKey = "OCI_REGION";
const validSecret = "test-only-session-secret-with-at-least-32-bytes";
const objectKey = "bridge/owner/title/master/film.mov";
const partBaseUrl = `https://objectstorage.ap-mumbai-1.oraclecloud.com/p/token/n/ns/b/bucket/u/${objectKey}/id/upload-123/`;
const expected = { sessionId: "session-123", actorUserId: "actor-1", assetId: "asset-123", objectKey };

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { run(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("multipart session token binds actor, asset, object key and exact OCI target", () => {
  withEnv({ [secretKey]: validSecret, [regionKey]: "ap-mumbai-1" }, () => {
    const token = signMultipartSession({
      ...expected, uploadId: "upload-123", partBaseUrl, expiresAt: Date.now() + 60_000,
    });
    const claims = verifyMultipartSession(token, expected);
    assert.equal(claims.uploadId, "upload-123");
    assert.equal(claims.partBaseUrl, partBaseUrl);
    assert.throws(() => signMultipartSession({
      ...expected, uploadId: "different-upload", partBaseUrl, expiresAt: Date.now() + 60_000,
    }), /target is invalid/);
    assert.throws(() => verifyMultipartSession(token, { ...expected, actorUserId: "other" }), /does not match/);
    assert.throws(() => verifyMultipartSession(token, { ...expected, assetId: "other-asset" }), /does not match/);
    assert.throws(() => verifyMultipartSession(token, { ...expected, objectKey: "other/key" }), /does not match/);
  });
});

test("multipart session token rejects tampering, expiry and wrong OCI region", () => {
  withEnv({ [secretKey]: validSecret, [regionKey]: "ap-mumbai-1" }, () => {
    const token = signMultipartSession({
      ...expected, uploadId: "upload-123", partBaseUrl, expiresAt: Date.now() + 60_000,
    });
    const [payload, sig] = token.split(".");
    assert.throws(() => verifyMultipartSession(`${payload}.${sig.slice(0, -2)}aa`, expected), /signature/);
    // Construct a correctly signed but expired token: the production signer must
    // refuse to issue expired capabilities, so the verifier test signs this fixture directly.
    const expiredClaims = {
      version: 1,
      ...expected,
      uploadId: "upload-123",
      partBaseUrl,
      expiresAt: Date.now() - 1,
    };
    const expiredPayload = Buffer.from(JSON.stringify(expiredClaims)).toString("base64url");
    const expiredSignature = createHmac("sha256", validSecret)
      .update(expiredPayload)
      .digest("base64url");
    assert.throws(
      () => verifyMultipartSession(`${expiredPayload}.${expiredSignature}`, expected),
      /expired/,
    );
    process.env[regionKey] = "us-phoenix-1";
    assert.throws(() => verifyMultipartSession(token, expected), /expired or does not match/);
  });
});

test("multipart session signing fails closed when secret is absent or too short", () => {
  withEnv({ [secretKey]: undefined, [regionKey]: "ap-mumbai-1" }, () => {
    assert.throws(assertMultipartSessionSigningReady, /at least 32 bytes/);
  });
  withEnv({ [secretKey]: "short", [regionKey]: "ap-mumbai-1" }, () => {
    assert.throws(assertMultipartSessionSigningReady, /at least 32 bytes/);
  });
});
