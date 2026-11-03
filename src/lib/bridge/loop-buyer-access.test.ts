import assert from "node:assert/strict";
import test from "node:test";
import { authorizeLoopBuyerTitle, type LoopBuyerPrincipal, type LoopBuyerPublicationGrant } from "./loop-buyer-access.ts";

const principal: LoopBuyerPrincipal = {
  userId: "loop-buyer-user",
  organizationId: "loop-buyer-org",
  accountType: "buyer",
  emailVerified: true,
  membershipStatus: "active",
  organizationStatus: "active",
};
const grant: LoopBuyerPublicationGrant = {
  buyerOrganizationId: "loop-buyer-org",
  titleId: "bridge-title-1",
  authorizationStatus: "AUTHORIZED",
  territories: ["WORLDWIDE"],
  languages: ["Malayalam"],
  exploitationModels: ["TVOD"],
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2027-01-01T00:00:00.000Z",
  revokedAt: null,
};
const request = {
  titleId: "bridge-title-1",
  territory: "IN",
  language: "Malayalam",
  exploitationModel: "TVOD",
  now: new Date("2026-11-03T12:00:00.000Z"),
};

test("allows only a verified active buyer in the exact authorized organization and rights window", () => {
  assert.deepEqual(authorizeLoopBuyerTitle(principal, grant, request), { allow: true, reason: "ALLOW" });
});

test("denies a different buyer organization (Buyer A/B isolation)", () => {
  const buyerB = { ...principal, organizationId: "another-buyer-org" };
  assert.equal(authorizeLoopBuyerTitle(buyerB, grant, request).reason, "ORGANIZATION_SCOPE_MISMATCH");
});

test("denies non-buyer and unverified identities", () => {
  assert.equal(authorizeLoopBuyerTitle({ ...principal, accountType: "admin" }, grant, request).reason, "BUYER_IDENTITY_REQUIRED");
  assert.equal(authorizeLoopBuyerTitle({ ...principal, emailVerified: false }, grant, request).reason, "BUYER_IDENTITY_REQUIRED");
});

test("denies inactive membership and suspended organization", () => {
  assert.equal(authorizeLoopBuyerTitle({ ...principal, membershipStatus: "suspended" }, grant, request).reason, "ACTIVE_MEMBERSHIP_REQUIRED");
  assert.equal(authorizeLoopBuyerTitle({ ...principal, organizationStatus: "suspended" }, grant, request).reason, "ACTIVE_ORGANIZATION_REQUIRED");
});

test("denies wrong title, territory, language and exploitation model", () => {
  assert.equal(authorizeLoopBuyerTitle(principal, grant, { ...request, titleId: "other-title" }).reason, "TITLE_SCOPE_MISMATCH");
  assert.equal(authorizeLoopBuyerTitle(principal, { ...grant, territories: ["IN"] }, { ...request, territory: "US" }).reason, "RIGHTS_DIMENSION_MISMATCH");
  assert.equal(authorizeLoopBuyerTitle(principal, { ...grant, languages: ["Tamil"] }, request).reason, "RIGHTS_DIMENSION_MISMATCH");
  assert.equal(authorizeLoopBuyerTitle(principal, { ...grant, exploitationModels: ["SVOD"] }, request).reason, "RIGHTS_DIMENSION_MISMATCH");
});

test("denies revoked, pending, expired, malformed or unbounded publication windows", () => {
  assert.equal(authorizeLoopBuyerTitle(principal, { ...grant, revokedAt: "2026-10-01T00:00:00Z" }, request).reason, "PUBLICATION_REVOKED");
  assert.equal(authorizeLoopBuyerTitle(principal, { ...grant, authorizationStatus: "PENDING" }, request).reason, "PUBLICATION_NOT_ACTIVE");
  assert.equal(authorizeLoopBuyerTitle(principal, { ...grant, windowEnd: "2026-11-01T00:00:00Z" }, request).reason, "RIGHTS_WINDOW_NOT_ACTIVE");
  assert.equal(authorizeLoopBuyerTitle(principal, { ...grant, windowEnd: null }, request).reason, "EXPLICIT_RIGHTS_WINDOW_REQUIRED");
  assert.equal(authorizeLoopBuyerTitle(principal, { ...grant, windowEnd: "invalid" }, request).reason, "EXPLICIT_RIGHTS_WINDOW_REQUIRED");
});

test("fails closed for missing principal or grant", () => {
  assert.equal(authorizeLoopBuyerTitle(null, grant, request).reason, "INVALID_PRINCIPAL");
  assert.equal(authorizeLoopBuyerTitle(principal, null, request).reason, "PUBLICATION_NOT_FOUND");
});
