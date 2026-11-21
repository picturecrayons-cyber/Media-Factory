import test from "node:test";
import assert from "node:assert/strict";
import { isPersistedAssetVerified } from "./persisted-asset-state.ts";

const validState = {
  id: "asset-1234",
  kind: "master",
  s3Key: "bridge/creator/title/master.mov.verified/asset-1234",
  byteSize: 416,
  contentType: "video/quicktime",
  titleMasterKey: "bridge/creator/title/master.mov.verified/asset-1234",
  titlePosterKey: null,
  auditPresent: true,
};

test("persisted asset is verified only when object, title reference and audit agree", async () => {
  let calls = 0;
  const verifyObject = async (key: string, contentType: string | null) => {
    calls++;
    assert.equal(key, validState.s3Key);
    assert.equal(contentType, "video/quicktime");
    return { byteSize: 416, etag: "etag-123" };
  };
  assert.equal(await isPersistedAssetVerified(validState, verifyObject), true);
  assert.equal(calls, 1);
});

test("malformed persisted states fail closed without trusting byte_size", async () => {
  const verifyObject = async () => ({ byteSize: 416, etag: "etag-123" });
  const cases = [
    { ...validState, byteSize: null },
    { ...validState, byteSize: 0 },
    { ...validState, s3Key: "source/master.mov" },
    { ...validState, titleMasterKey: "different-sealed-key" },
    { ...validState, auditPresent: false },
  ];
  for (const state of cases) {
    assert.equal(await isPersistedAssetVerified(state, verifyObject), false);
  }
});

test("object size mismatch or missing ETag is never verified", async () => {
  assert.equal(await isPersistedAssetVerified(validState, async () => ({
    byteSize: 415, etag: "etag-123",
  })), false);
  assert.equal(await isPersistedAssetVerified(validState, async () => ({
    byteSize: 416, etag: null,
  })), false);
});

test("OCI verification errors propagate so callers cannot report success", async () => {
  await assert.rejects(
    isPersistedAssetVerified(validState, async () => { throw new Error("OCI HEAD failed"); }),
    /OCI HEAD failed/,
  );
});
