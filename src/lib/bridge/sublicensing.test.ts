import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBridgeSublicensingAuthority,
  canBridgeAuthorizeSublicensing,
  createDefaultDistributionMandate,
  canSublicenseWithinMandate,
} from "./distribution-mandate.ts";

test("Creator/Studio distribution mandate never grants onward sublicensing", () => {
  const mandate = createDefaultDistributionMandate("2026-11-18T00:00:00.000Z");
  assert.equal(mandate.sublicensingAllowed, false);
  assert.equal(canSublicenseWithinMandate(mandate, true), false);
});

test("only a verified Bridge Super Admin role is accepted by the decision guard", () => {
  assert.doesNotThrow(() => assertBridgeSublicensingAuthority({ internalRole: "super_admin" }));
  for (const actor of [
    { internalRole: "admin" },
    { internalRole: "legal_reviewer" },
    { accountType: "independent_creator" },
    { accountType: "studio" },
    { accountType: "buyer" },
    { accountType: "buyer", internalRole: "super_admin" },
  ]) {
    assert.throws(() => assertBridgeSublicensingAuthority(actor));
  }
});

test("Super Admin still needs a title-specific rights grant that permits sublicensing", () => {
  const superAdmin = { internalRole: "super_admin" };
  assert.equal(canBridgeAuthorizeSublicensing(superAdmin, true), true);
  assert.equal(canBridgeAuthorizeSublicensing(superAdmin, false), false);
  assert.equal(canBridgeAuthorizeSublicensing({ internalRole: "admin" }, true), false);
});
