import assert from "node:assert/strict";
import test from "node:test";
import { authorizePlatformBuyerAcquisition, type AcquisitionRights, type BuyerMandate } from "./buyer-mandate-policy.ts";

const organization = { kind: "platform_buyer" as const, verificationStatus: "verified" as const };
const mandate: BuyerMandate = {
  status: "verified",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveUntil: "2027-01-01T00:00:00.000Z",
  channels: ["YouTube"],
  territories: ["IN"],
  languages: ["Malayalam"],
  mediaRights: ["SVOD"],
  exploitationModels: ["subscription"],
  exclusivity: "non_exclusive",
  sublicensingAllowed: false,
  onwardDelegationAllowed: false,
};
const rights: AcquisitionRights = {
  channel: "YouTube",
  territory: "IN",
  language: "Malayalam",
  mediaRight: "SVOD",
  exploitationModel: "subscription",
  exclusive: false,
  requiresSublicensing: false,
  requiresOnwardDelegation: false,
  startsAt: "2026-06-01T00:00:00.000Z",
  endsAt: "2026-12-01T00:00:00.000Z",
};
const now = new Date("2026-11-11T12:00:00.000Z");

test("allows only an exact in-scope verified platform acquisition", () => {
  assert.deepEqual(authorizePlatformBuyerAcquisition({ organization, mandate, rights, now }), { allowed: true });
});

test("fails closed for missing or unverified buyer organization", () => {
  assert.equal(authorizePlatformBuyerAcquisition({ organization: null, mandate, rights, now }).allowed, false);
  assert.deepEqual(authorizePlatformBuyerAcquisition({
    organization: { ...organization, verificationStatus: "pending_review" }, mandate, rights, now,
  }), { allowed: false, reason: "BUYER_ORGANIZATION_NOT_VERIFIED" });
});

test("fails closed without a verified mandate and for expired mandates", () => {
  assert.equal(authorizePlatformBuyerAcquisition({ organization, mandate: null, rights, now }).allowed, false);
  assert.deepEqual(authorizePlatformBuyerAcquisition({
    organization, mandate: { ...mandate, status: "revoked" }, rights, now,
  }), { allowed: false, reason: "ACTIVE_VERIFIED_MANDATE_REQUIRED" });
  assert.deepEqual(authorizePlatformBuyerAcquisition({
    organization, mandate: { ...mandate, effectiveUntil: "2026-11-01T00:00:00.000Z" }, rights, now,
  }), { allowed: false, reason: "MANDATE_EXPIRED" });
});

test("denies channel, territory, language, media and exploitation mismatches", () => {
  for (const changed of [
    { ...rights, channel: "Other platform" },
    { ...rights, territory: "US" },
    { ...rights, language: "Tamil" },
    { ...rights, mediaRight: "TVOD" },
    { ...rights, exploitationModel: "advertising" },
  ]) {
    assert.equal(authorizePlatformBuyerAcquisition({ organization, mandate, rights: changed, now }).allowed, false);
  }
});

test("denies unauthorized exclusivity, sublicensing and onward delegation", () => {
  for (const changed of [
    { ...rights, exclusive: true },
    { ...rights, requiresSublicensing: true },
    { ...rights, requiresOnwardDelegation: true },
  ]) {
    assert.equal(authorizePlatformBuyerAcquisition({ organization, mandate, rights: changed, now }).allowed, false);
  }
});

test("denies acquisition windows outside the mandate term", () => {
  assert.deepEqual(authorizePlatformBuyerAcquisition({
    organization, mandate, rights: { ...rights, startsAt: "2025-12-01T00:00:00.000Z" }, now,
  }), { allowed: false, reason: "RIGHTS_WINDOW_BEFORE_MANDATE" });
  assert.deepEqual(authorizePlatformBuyerAcquisition({
    organization, mandate, rights: { ...rights, endsAt: "2027-02-01T00:00:00.000Z" }, now,
  }), { allowed: false, reason: "RIGHTS_WINDOW_EXCEEDS_MANDATE" });
});
