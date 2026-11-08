import assert from "node:assert/strict";
import test from "node:test";
import { canBuyerAccessLicensePackage } from "./buyer-package-access.ts";

test("READY package can be claimed only while unassigned", () => {
  assert.equal(canBuyerAccessLicensePackage({ status: "READY", buyerUserId: null }, "buyer-a"), true);
  assert.equal(canBuyerAccessLicensePackage({ status: "READY", buyerUserId: "buyer-b" }, "buyer-a"), false);
});

test("IN_NEGOTIATION package is visible only to its reserving buyer", () => {
  const pkg = { status: "IN_NEGOTIATION", buyerUserId: "buyer-a" };
  assert.equal(canBuyerAccessLicensePackage(pkg, "buyer-a"), true);
  assert.equal(canBuyerAccessLicensePackage(pkg, "buyer-b"), false);
});

test("terminal or unknown package states fail closed", () => {
  for (const status of ["LICENSED", "DELIVERED", "REVOKED", "UNKNOWN"]) {
    assert.equal(canBuyerAccessLicensePackage({ status, buyerUserId: "buyer-a" }, "buyer-a"), false);
  }
  assert.equal(canBuyerAccessLicensePackage({ status: "READY", buyerUserId: null }, " "), false);
});
