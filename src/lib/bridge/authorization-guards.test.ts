import test from "node:test";
import assert from "node:assert/strict";
import { assertInternalRoleGrantBlocked } from "./authorization-guards.ts";
import { readFile } from "node:fs/promises";

test("single-actor internal role grant fails closed", () => {
  assert.throws(assertInternalRoleGrantBlocked, /dual-control approval workflow is not implemented/);
});

test("internal role invitation blocks before database writes and mail", async () => {
  const source = await readFile(new URL("./profiles.ts", import.meta.url), "utf8");
  const start = source.indexOf("export const inviteInternalRole");
  const end = source.length;
  const handler = source.slice(start, end);
  const guard = handler.indexOf("assertInternalRoleGrantBlocked()");
  assert.ok(guard >= 0);
  assert.ok(guard < handler.indexOf("const sql = await getSql()"));
  assert.ok(guard < handler.indexOf("await mail("));
});

test("Buyer entitlement list and asset delivery do not trust user-only legacy grants", async () => {
  const payments = await readFile(new URL("./payments.ts", import.meta.url), "utf8");
  const assets = await readFile(new URL("./assets.ts", import.meta.url), "utf8");
  assert.match(payments, /actor\.accountType === "buyer"\) return \{ entitlements: \[\] \}/);
  assert.match(assets, /if \(unscopedBuyer\) return false/);
  assert.match(assets, /actor\.accountType === "buyer"/);
});

test("Buyer asset listing hides restricted kinds and object keys regardless of internalRole", async () => {
  const assets = await readFile(new URL("./assets.ts", import.meta.url), "utf8");
  const start = assets.indexOf("export const listTitleAssets");
  assert.ok(start >= 0);
  const listing = assets.slice(start);
  assert.match(listing, /const buyer = actor\\.accountType === "buyer";/);
  assert.match(listing, /\\.filter\\(\\(r\\) => !buyer \\|\\| !\\["master", "technical", "censor_certificate"\\]\\.includes\\(r\\.kind\\)\\)/);
  assert.match(listing, /key: buyer \\? null : r\\.s3_key/);
  assert.doesNotMatch(listing, /actor\\.accountType === "buyer" && !actor\\.internalRole/);
});

test("Buyer checkout configuration is blocked before Razorpay credentials are read", async () => {
  const payments = await readFile(new URL("./payments.ts", import.meta.url), "utf8");
  const start = payments.indexOf("export const getCheckoutConfig");
  const end = payments.indexOf("export const createLicenseOrder", start);
  const handler = payments.slice(start, end);
  const guard = handler.indexOf("assertBuyerLicenseOrderBlocked(actor)");
  assert.ok(guard >= 0);
  assert.ok(guard < handler.indexOf("requireRazorpayKeys()"));
});
