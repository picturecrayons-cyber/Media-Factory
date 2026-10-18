import assert from "node:assert/strict";
import test from "node:test";
import { isActiveLoopPublication, loopStageType } from "./loop-lanes.ts";

test("CMS formats become the four public Loop lanes", () => {
  assert.equal(loopStageType("FEATURE"), "Film");
  assert.equal(loopStageType("Film"), "Film");
  assert.equal(loopStageType("SERIES"), "Series");
  assert.equal(loopStageType("VERTICAL"), "Vertical drama");
  assert.equal(loopStageType("Vertical drama"), "Vertical drama");
  assert.equal(loopStageType("SHORT"), "Short");
  assert.equal(loopStageType("movie"), "Film");
  assert.equal(loopStageType(""), "Unclassified");
  assert.equal(loopStageType("limited event recording"), "Unclassified");
});

test("only explicitly active, listed, published Loop titles count as buyer-facing", () => {
  const now = new Date("2026-10-18T12:00:00.000Z");
  const base = {
    authorizationStatus: "LIVE",
    listed: true,
    published: true,
    windowStart: "2026-10-01T00:00:00.000Z",
    windowEnd: "2026-11-01T00:00:00.000Z",
  };
  assert.equal(isActiveLoopPublication(base, now), true);
  assert.equal(isActiveLoopPublication({ ...base, authorizationStatus: "REVOKED" }, now), false);
  assert.equal(isActiveLoopPublication({ ...base, listed: false }, now), false);
  assert.equal(isActiveLoopPublication({ ...base, published: false }, now), false);
  assert.equal(isActiveLoopPublication({ ...base, windowEnd: "2026-10-01T00:00:00.000Z" }, now), false);
  assert.equal(isActiveLoopPublication({ ...base, windowStart: null }, now), false);
});
