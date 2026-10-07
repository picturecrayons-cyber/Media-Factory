import assert from "node:assert/strict";
import test from "node:test";
import { loopStageType } from "./loop-lanes.ts";

test("CMS formats become the four public Loop lanes", () => {
  assert.equal(loopStageType("FEATURE"), "Film");
  assert.equal(loopStageType("Film"), "Film");
  assert.equal(loopStageType("SERIES"), "Series");
  assert.equal(loopStageType("VERTICAL"), "Vertical drama");
  assert.equal(loopStageType("Vertical drama"), "Vertical drama");
  assert.equal(loopStageType("SHORT"), "Short");
  assert.equal(loopStageType("movie"), "Film");
});
