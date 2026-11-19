import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultDistributionMandate,
  isDestinationCovered,
  canSublicenseWithinMandate,
  assertBridgeSublicensingAuthority,
  canBridgeAuthorizeSublicensing,
} from "./distribution-mandate.ts";

test("default Creator/Studio mandate is active, versioned and sublicensing-denied", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(mandate.enabled, true);
  assert.ok(mandate.destinations.includes("Crayons Loop"));
  assert.equal(mandate.sublicensingAllowed, false);
});

test("destination scope cannot exceed the accepted mandate", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(isDestinationCovered(mandate, ["Crayons Loop"]), true);
  assert.equal(isDestinationCovered(mandate, ["UNAPPROVED_PLATFORM"]), false);
});

test("a title-level flag cannot elevate Creator/Studio sublicensing authority", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(canSublicenseWithinMandate(mandate, false), false);
  assert.equal(canSublicenseWithinMandate(mandate, true), false);
});

test("only Bridge Super Admin passes the sublicensing authority guard", () => {
  assert.doesNotThrow(() => assertBridgeSublicensingAuthority({ internalRole: "super_admin" }));
  for (const actor of [{ internalRole: "admin" }, { accountType: "studio" }, { accountType: "independent_creator" }, { accountType: "buyer" }]) {
    assert.throws(() => assertBridgeSublicensingAuthority(actor), /Only Crayons Bridge Super Admin/);
  }
});

test("Bridge Super Admin still needs title-specific grant permission", () => {
  assert.equal(canBridgeAuthorizeSublicensing({ internalRole: "super_admin" }, true), true);
  assert.equal(canBridgeAuthorizeSublicensing({ internalRole: "super_admin" }, false), false);
  assert.equal(canBridgeAuthorizeSublicensing({ accountType: "buyer" }, true), false);
});
