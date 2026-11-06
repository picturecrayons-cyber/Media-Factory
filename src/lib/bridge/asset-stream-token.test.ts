import test from "node:test";
import assert from "node:assert/strict";
import { createAssetStreamToken, verifyAssetStreamToken } from "./asset-stream-token.server.ts";

test("asset stream token binds actor and asset and rejects tampering", () => {
  const previous=process.env.BRIDGE_ASSET_STREAM_SECRET;
  process.env.BRIDGE_ASSET_STREAM_SECRET="test-only-asset-stream-secret-at-least-32-bytes";
  try {
    const token=createAssetStreamToken("actor-1","asset-123",60);
    assert.equal(verifyAssetStreamToken(token,"asset-123","actor-1").actorUserId,"actor-1");
    assert.throws(()=>verifyAssetStreamToken(token,"asset-123","actor-2"),/authenticated actor/);
    assert.throws(()=>verifyAssetStreamToken(token,"asset-other","actor-1"),/authenticated actor/);
    const [payload,sig]=token.split(".");
    assert.throws(()=>verifyAssetStreamToken(payload+"."+sig.slice(0,-1)+"x","asset-123","actor-1"),/signature/);
  } finally { if(previous===undefined) delete process.env.BRIDGE_ASSET_STREAM_SECRET; else process.env.BRIDGE_ASSET_STREAM_SECRET=previous; }
});
