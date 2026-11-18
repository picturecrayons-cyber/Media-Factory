import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultDistributionMandate,
  isDestinationCovered,
  canSublicenseWithinMandate,
} from "./distribution-mandate.ts";

test("default creator mandate is active, versioned and bounded", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(mandate.enabled, true);
  assert.ok(mandate.destinations.includes("CRAYONS_LOOP"));
  assert.ok(mandate.destinations.includes("EXTERNAL_OTT"));
  assert.equal(mandate.sublicensingAllowed, false);
});

test("a title cannot exceed the account mandate destination scope", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(isDestinationCovered(mandate, ["CRAYONS_LOOP"]), true);
  assert.equal(isDestinationCovered(mandate, ["UNAPPROVED_PLATFORM"]), false);
});

test("sub-licensing needs both account-level and title-level permission", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(canSublicenseWithinMandate(mandate, false), false);
  assert.equal(canSublicenseWithinMandate(mandate, true), false);
});
