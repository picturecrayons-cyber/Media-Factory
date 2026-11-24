import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultDistributionMandate, isDestinationCovered, isMediaCovered, canSublicenseWithinMandate } from "./distribution-mandate.ts";

test("default mandate is versioned, explicit, and disables sublicensing", () => {
  const mandate = createDefaultDistributionMandate("2026-11-25T00:00:00.000Z");
  assert.equal(mandate.enabled, true);
  assert.equal(mandate.version, 1);
  assert.equal(mandate.sublicensingAllowed, false);
  assert.ok(mandate.destinations.includes("Crayons Loop"));
});
test("destination and media scope fail closed", () => {
  const mandate = createDefaultDistributionMandate("2026-11-25T00:00:00.000Z");
  assert.equal(isDestinationCovered(mandate, ["Crayons Loop"]), true);
  assert.equal(isDestinationCovered(mandate, ["UNAPPROVED"]), false);
  assert.equal(isMediaCovered(mandate, ["TVOD"]), true);
  assert.equal(isMediaCovered(mandate, ["UNAPPROVED"]), false);
});
test("sublicensing needs both permissions and is disabled by default", () => {
  const mandate = createDefaultDistributionMandate("2026-11-25T00:00:00.000Z");
  assert.equal(canSublicenseWithinMandate(mandate, true), false);
});
