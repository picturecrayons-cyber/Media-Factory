import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultDistributionMandate,
  isDestinationCovered,
  isMediaCovered,
  canSublicenseWithinMandate,
} from "./distribution-mandate.ts";

test("Creator and Studio mandate is versioned, timestamped and bounded", () => {
  const mandate = createDefaultDistributionMandate("2026-11-25T00:00:00.000Z");
  assert.equal(mandate.enabled, true);
  assert.equal(mandate.version, 1);
  assert.equal(mandate.consentTextVersion, "creator-distribution-mandate-v1");
  assert.ok(mandate.destinations.includes("Crayons Loop"));
  assert.ok(mandate.media.includes("SVOD"));
  assert.equal(mandate.sublicensingAllowed, false);
});

test("destination and media requests cannot exceed the accepted account scope", () => {
  const mandate = createDefaultDistributionMandate("2026-11-25T00:00:00.000Z");
  assert.equal(isDestinationCovered(mandate, ["Crayons Loop"]), true);
  assert.equal(isDestinationCovered(mandate, ["Unapproved Platform"]), false);
  assert.equal(isMediaCovered(mandate, ["SVOD", "TVOD"]), true);
  assert.equal(isMediaCovered(mandate, ["Unapproved Media"]), false);
});

test("sublicensing remains denied even if a title grant alone allows it", () => {
  const mandate = createDefaultDistributionMandate("2026-11-25T00:00:00.000Z");
  assert.equal(canSublicenseWithinMandate(mandate, false), false);
  assert.equal(canSublicenseWithinMandate(mandate, true), false);
});
