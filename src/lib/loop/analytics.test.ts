import test from "node:test";
import assert from "node:assert/strict";
import { loopAnalyticsEventInput } from "./analytics.ts";

test("accepts bounded observational playback events", () => {
  const parsed = loopAnalyticsEventInput.parse({
    eventId: "e1a9caa8-71c8-4b83-a12d-42a4c6b71e11",
    loopTitleId: "loop-title-123",
    sessionId: "a1a9caa8-71c8-4b83-a12d-42a4c6b71e11",
    eventType: "PLAYBACK_PROGRESS",
    watchedSeconds: 30,
  });
  assert.equal(parsed.watchedSeconds, 30);
});

test("rejects client-reported watch intervals above 30 seconds", () => {
  assert.throws(() => loopAnalyticsEventInput.parse({
    eventId: "e1a9caa8-71c8-4b83-a12d-42a4c6b71e11",
    loopTitleId: "loop-title-123",
    sessionId: "a1a9caa8-71c8-4b83-a12d-42a4c6b71e11",
    eventType: "PLAYBACK_PROGRESS",
    watchedSeconds: 31,
  }));
});

test("does not accept payment claims or client identity fields", () => {
  const parsed = loopAnalyticsEventInput.parse({
    eventId: "e1a9caa8-71c8-4b83-a12d-42a4c6b71e11",
    loopTitleId: "loop-title-123",
    sessionId: "a1a9caa8-71c8-4b83-a12d-42a4c6b71e11",
    eventType: "PLAYBACK_START",
    userId: "forged-user",
    paymentStatus: "captured",
    amountPaise: 99900,
  });
  assert.equal("userId" in parsed, false);
  assert.equal("paymentStatus" in parsed, false);
  assert.equal("amountPaise" in parsed, false);
});
