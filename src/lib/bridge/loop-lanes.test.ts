import assert from "node:assert/strict";
import test from "node:test";
import { loopStageType, storedBridgeContentType } from "./loop-lanes.ts";

test("CMS formats become the four public Loop lanes", () => {
  assert.equal(loopStageType("FEATURE"), "Film");
  assert.equal(loopStageType("Film"), "Film");
  assert.equal(loopStageType("SERIES"), "Series");
  assert.equal(loopStageType("VERTICAL"), "Vertical drama");
  assert.equal(loopStageType("Vertical drama"), "Vertical drama");
  assert.equal(loopStageType("SHORT"), "Short");
  assert.equal(loopStageType("movie"), "Film");
});

test("submission labels map to the established Bridge content type values", () => {
  assert.equal(storedBridgeContentType("Film"), "FEATURE");
  assert.equal(storedBridgeContentType("Series"), "SERIES");
  assert.equal(storedBridgeContentType("Vertical drama"), "OTHER");
  assert.equal(storedBridgeContentType("Short"), "SHORT");
  assert.equal(storedBridgeContentType("Documentary"), "DOCUMENTARY");
  assert.equal(storedBridgeContentType("Other"), "OTHER");
  assert.throws(() => storedBridgeContentType("Unknown"));
});
