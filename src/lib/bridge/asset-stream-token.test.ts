import test from "node:test";
import assert from "node:assert/strict";
import { createAssetStreamToken, verifyAssetStreamToken } from "./asset-stream-token.server.ts";

test("asset stream token is bound to asset and expires", () => {
  const key = "BRIDGE_ASSET_STREAM_SECRET";
  const previous = process.env[key];
  process.env[key] = "test-only-asset-stream-secret-at-least-32-bytes";
  try {
    const token = createAssetStreamToken("actor-1", "asset-123", 60);
    assert.equal(verifyAssetStreamToken(token, "asset-123").actorUserId, "actor-1");
    assert.throws(() => verifyAssetStreamToken(token, "asset-other"), /does not match/);
    const [payload, signature] = token.split(".");
    assert.throws(() => verifyAssetStreamToken(`${payload}.${signature.slice(0,-1)}x`, "asset-123"), /signature/);
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
