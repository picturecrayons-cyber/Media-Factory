import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultDistributionMandate,
  isDestinationCovered,
  canSublicenseWithinMandate,
} from "../src/lib/bridge/distribution-mandate.ts";

test("Creator default mandate is active and versioned", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(mandate.enabled, true);
  assert.ok(mandate.destinations.includes("CRAYONS_LOOP"));
  assert.equal(mandate.sublicensingAllowed, false);
});

test("mandate restricts destination requests to its stored scope", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(isDestinationCovered(mandate, ["CRAYONS_LOOP"]), true);
  assert.equal(isDestinationCovered(mandate, ["UNAPPROVED_PLATFORM"]), false);
});

test("sublicensing fails closed unless both mandate and title grant allow it", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(canSublicenseWithinMandate(mandate, false), false);
  assert.equal(canSublicenseWithinMandate(mandate, true), false);
});
