import assert from "node:assert/strict";
import test from "node:test";
import { hasExclusiveRightsOverlap } from "./distribution-avails-policy.ts";

test("exclusive grants with overlapping scope require review", () => {
  const grant = {
    territories: ["IN"],
    languages: ["Malayalam"],
    media: ["SVOD"],
    window_start: "2026-01-01T00:00:00.000Z",
    window_end: "2027-01-01T00:00:00.000Z",
    exclusivity: "EXCLUSIVE",
  };
  assert.equal(hasExclusiveRightsOverlap([grant, { ...grant, exclusivity: "NON_EXCLUSIVE" }]), true);
  assert.equal(hasExclusiveRightsOverlap([{ ...grant, exclusivity: "NON_EXCLUSIVE" }, { ...grant, exclusivity: "NON_EXCLUSIVE" }]), false);
});
