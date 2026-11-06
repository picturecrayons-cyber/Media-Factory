import test from "node:test";
import assert from "node:assert/strict";
import { assertFullSettlementAmount, computeReportedNetMinor } from "./revenue-accounting.ts";

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


test("reported net rejects safe-integer overflow", () => {
  assert.throws(() => computeReportedNetMinor(Number.MAX_SAFE_INTEGER, 1), /safe minor-unit range/);
});

test("payment recording requires exact full reconciled settlement", () => {
  assert.equal(assertFullSettlementAmount(8_750, 8_750), undefined);
  assert.throws(() => assertFullSettlementAmount(0, 8_750), /positive safe minor-unit/);
  assert.throws(() => assertFullSettlementAmount(8_749, 8_750), /must equal the reconciled net/);
  assert.throws(() => assertFullSettlementAmount(8_751, 8_750), /must equal the reconciled net/);
  assert.throws(() => assertFullSettlementAmount(8_750, null), /reconciled net amount/);
});
