import test from "node:test";
import assert from "node:assert/strict";
import { validateDistributionForm } from "./distribution-form-validation.ts";

const valid = {
  territories: "WORLDWIDE",
  languages: "Malayalam",
  windowStart: "2026-11-01T00:00",
  windowEnd: "2027-11-01T00:00",
};

test("blocks publication form when either window date is missing", () => {
  assert.ok(validateDistributionForm({ ...valid, windowStart: "" }).some((e) => e.includes("both distribution window")));
  assert.ok(validateDistributionForm({ ...valid, windowEnd: "" }).some((e) => e.includes("both distribution window")));
});

test("blocks a window whose end is not after its start", () => {
  assert.ok(validateDistributionForm({ ...valid, windowEnd: valid.windowStart }).some((e) => e.includes("strictly after")));
  assert.ok(validateDistributionForm({ ...valid, windowEnd: "2026-10-01T00:00" }).some((e) => e.includes("strictly after")));
});

test("blocks rights dimensions that differ from the current server preflight", () => {
  assert.ok(validateDistributionForm({ ...valid, territories: "IN" }).some((e) => e.includes("WORLDWIDE")));
  assert.ok(validateDistributionForm({ ...valid, territories: "WORLDWIDE, IN" }).some((e) => e.includes("WORLDWIDE")));
  assert.ok(validateDistributionForm({ ...valid, languages: " " }).some((e) => e.includes("language")));
});

test("accepts a complete form shape without claiming legal approval", () => {
  assert.deepEqual(validateDistributionForm(valid), []);
});
