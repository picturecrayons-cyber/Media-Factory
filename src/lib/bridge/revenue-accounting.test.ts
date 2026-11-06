import test from "node:test";
import assert from "node:assert/strict";
import { computeReportedNetMinor } from "./revenue-accounting.ts";

test("estimate-only rows never become reported earnings", () => {
  assert.equal(computeReportedNetMinor(null, 0), null);
  assert.equal(computeReportedNetMinor(undefined, 250), null);
});

test("reported net applies adjustments without going below zero", () => {
  assert.equal(computeReportedNetMinor(10_000, -1_250), 8_750);
  assert.equal(computeReportedNetMinor(500, -900), 0);
});

test("reported amounts must be safe non-negative minor-unit integers", () => {
  assert.throws(() => computeReportedNetMinor(-1, 0));
  assert.throws(() => computeReportedNetMinor(1.25, 0));
  assert.throws(() => computeReportedNetMinor(Number.MAX_SAFE_INTEGER + 1, 0));
  assert.throws(() => computeReportedNetMinor(100, 0.5));
});
