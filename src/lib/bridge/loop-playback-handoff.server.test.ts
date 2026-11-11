import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyLoopPlaybackHandoffSignature } from "./loop-playback-handoff.server";

afterEach(() => vi.unstubAllEnvs());

describe("Loop playback handoff service authentication", () => {
  it("accepts a timestamped HMAC over the exact request body", () => {
    const secret = "test-handoff-secret";
    const rawBody = JSON.stringify({ bridgeTitleId: "bridge-title", loopTitleId: "loop-title", mediaType: "video" });
    const timestamp = "1794400000";
    vi.stubEnv("BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET", secret);
    const signature = createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex");
    expect(verifyLoopPlaybackHandoffSignature({ rawBody, timestamp, signature, nowSeconds: 1794400000 })).toBe(true);
  });

  it("rejects a modified body, missing secret, malformed signature and stale timestamp", () => {
    const secret = "test-handoff-secret";
    const rawBody = '{"bridgeTitleId":"bridge-title"}';
    const timestamp = "1794400000";
    vi.stubEnv("BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET", secret);
    const signature = createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex");
    expect(verifyLoopPlaybackHandoffSignature({ rawBody: rawBody + " ", timestamp, signature, nowSeconds: 1794400000 })).toBe(false);
    expect(verifyLoopPlaybackHandoffSignature({ rawBody, timestamp, signature: "bad", nowSeconds: 1794400000 })).toBe(false);
    expect(verifyLoopPlaybackHandoffSignature({ rawBody, timestamp, signature, nowSeconds: 1794400100 })).toBe(false);
    vi.stubEnv("BRIDGE_LOOP_PLAYBACK_HANDOFF_SECRET", "");
    expect(verifyLoopPlaybackHandoffSignature({ rawBody, timestamp, signature, nowSeconds: 1794400000 })).toBe(false);
  });
});
