import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { verifyLoopPlaybackHandoffSignature } from "./loop-playback-handoff.server";

test("accepts a timestamped HMAC over the exact request body", () => {
  const secret = "test-handoff-secret";
  const rawBody = JSON.stringify({ bridgeTitleId: "bridge-title", loopTitleId: "loop-title", mediaType: "video" });
  const timestamp = "1794400000";
  const previous = process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET;
  process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET = secret;
  try {
    const signature = createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex");
    assert.equal(verifyLoopPlaybackHandoffSignature({ rawBody, timestamp, signature, nowSeconds: 1794400000 }), true);
  } finally {
    if (previous === undefined) delete process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET;
    else process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET = previous;
  }
});

test("rejects modified body, missing secret, malformed signature and stale timestamp", () => {
  const secret = "test-handoff-secret";
  const rawBody = '{"bridgeTitleId":"bridge-title"}';
  const timestamp = "1794400000";
  const previous = process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET;
  process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET = secret;
  try {
    const signature = createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex");
    assert.equal(verifyLoopPlaybackHandoffSignature({ rawBody: rawBody + " ", timestamp, signature, nowSeconds: 1794400000 }), false);
    assert.equal(verifyLoopPlaybackHandoffSignature({ rawBody, timestamp, signature: "bad", nowSeconds: 1794400000 }), false);
    assert.equal(verifyLoopPlaybackHandoffSignature({ rawBody, timestamp, signature, nowSeconds: 1794400100 }), false);
    process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET = "";
    assert.equal(verifyLoopPlaybackHandoffSignature({ rawBody, timestamp, signature, nowSeconds: 1794400000 }), false);
  } finally {
    if (previous === undefined) delete process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET;
    else process.env.BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET = previous;
  }
});
