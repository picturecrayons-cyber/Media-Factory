import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canBuyerAccessLicensePackage, canBuyerViewLicensePackage } from "./buyer-package-access.ts";

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


test("buyer package listings hide another buyer's reservation and terminal packages", () => {
  assert.equal(canBuyerViewLicensePackage({ status: "READY", buyerUserId: null }, "buyer-a"), true);
  assert.equal(canBuyerViewLicensePackage({ status: "IN_NEGOTIATION", buyerUserId: "buyer-a" }, "buyer-a"), true);
  assert.equal(canBuyerViewLicensePackage({ status: "LICENSED", buyerUserId: "buyer-a" }, "buyer-a"), true);
  assert.equal(canBuyerViewLicensePackage({ status: "IN_NEGOTIATION", buyerUserId: "buyer-b" }, "buyer-a"), false);
  assert.equal(canBuyerViewLicensePackage({ status: "LICENSED", buyerUserId: "buyer-b" }, "buyer-a"), false);
  assert.equal(canBuyerViewLicensePackage({ status: "REVOKED", buyerUserId: "buyer-a" }, "buyer-a"), false);
  assert.equal(canBuyerViewLicensePackage({ status: "READY", buyerUserId: null }, " "), false);
});


test("buyer title reads require explicit active and unexpired buyer grants", () => {
  const source = readFileSync(new URL("./buyer-visibility.ts", import.meta.url), "utf8");
  assert.match(source, /from bridge_buyer_title_access a/);
  assert.match(source, /a\.buyer_user_id = \$\{buyerUserId\}/);
  assert.match(source, /a\.revoked_at is null/);
  assert.match(source, /a\.expires_at is null or a\.expires_at > now\(\)/);
  assert.match(source, /bridge_assert_buyer_publishable/);
});

test("buyer catalog and package payment paths enforce per-buyer isolation", () => {
  const titles = readFileSync(new URL("./titles.ts", import.meta.url), "utf8");
  const rights = readFileSync(new URL("./multilingual-rights.ts", import.meta.url), "utf8");
  const payments = readFileSync(new URL("./payments.ts", import.meta.url), "utf8");
  assert.match(titles, /a\.buyer_user_id = \$\{actor\.userId\}/);
  assert.match(rights, /canBuyerViewLicensePackage/);
  assert.match(payments, /buyer_user_id = \$\{payment\.user_id\}/);
  assert.match(payments, /Payment buyer does not own the reserved license package/);
});
