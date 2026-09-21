import assert from "node:assert/strict";
import test from "node:test";
import { countPipeline, formatInrPaise } from "./studio-metrics.ts";

test("pipeline counts are zero when the slate is empty", () => {
  const cols = countPipeline([]);
  assert.equal(cols.every((c) => c.count === 0), true);
});

test("pipeline maps canonical statuses without a second title model", () => {
  const cols = countPipeline([
    { status: "DRAFT" },
    { status: "QC_REVIEW" },
    { status: "LICENSED" },
  ]);
  assert.equal(cols.find((c) => c.id === "draft")?.count, 1);
  assert.equal(cols.find((c) => c.id === "review")?.count, 1);
  assert.equal(cols.find((c) => c.id === "licensed")?.count, 1);
  assert.equal(cols.find((c) => c.id === "delivered")?.count, 0);
});

test("revenue formatter stays silent at zero — no fake rupees", () => {
  assert.equal(formatInrPaise(0), null);
  assert.ok(formatInrPaise(19900)?.includes("199"));
});
