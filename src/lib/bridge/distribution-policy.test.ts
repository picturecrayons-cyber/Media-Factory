import assert from "node:assert/strict";
import test from "node:test";
import { assertSublicensingPolicy, defaultSublicensingMetadata } from "./distribution-policy.ts";

const validException = {
  permitted: true,
  superAdminApproved: true,
  legalReviewApproved: true,
  authorizedBy: "staff-user-1",
  authorizedAt: "2026-10-01T00:00:00.000Z",
  legalReference: "LEGAL-APPROVAL-123",
  titleId: "bridge-title-123",
  packageVersion: 2,
  directPartner: "BUYER-ABC",
  downstreamPlatforms: ["PLATFORM-X"],
  territories: ["IN"],
  languages: ["Malayalam"],
  exploitationModels: ["TVOD"],
  windowStart: "2026-10-01T00:00:00.000Z",
  windowEnd: "2026-12-01T00:00:00.000Z",
};

test("sublicensing defaults to not permitted", () => {
  assert.equal(assertSublicensingPolicy(), false);
  assert.deepEqual(defaultSublicensingMetadata(), {
    sublicensingPermitted: false,
    sublicensingPolicy: "NOT_PERMITTED",
  });
});

test("ordinary distribution, payment, or delivery cannot turn sublicensing on", () => {
  assert.equal(assertSublicensingPolicy({ permitted: false, directPartner: "BUYER-ABC" }), false);
});

test("rejects an attempted sublicense without explicit approvals", () => {
  assert.throws(
    () => assertSublicensingPolicy({ permitted: true, titleId: "title-1" }),
    /Sublicensing denied/,
  );
});

test("rejects incomplete or empty downstream scope", () => {
  assert.throws(
    () => assertSublicensingPolicy({ ...validException, downstreamPlatforms: [] }),
    /Sublicensing denied/,
  );
  assert.throws(
    () => assertSublicensingPolicy({ ...validException, packageVersion: 0 }),
    /Sublicensing denied/,
  );
  assert.throws(
    () => assertSublicensingPolicy({ ...validException, legalReviewApproved: false }),
    /Sublicensing denied/,
  );
});

test("rejects expired or reversed sublicense windows", () => {
  assert.throws(
    () => assertSublicensingPolicy({ ...validException, windowEnd: "2020-01-01T00:00:00.000Z" }),
    /Sublicensing denied/,
  );
  assert.throws(
    () => assertSublicensingPolicy({ ...validException, windowStart: "2026-12-01T00:00:00.000Z" }),
    /Sublicensing denied/,
  );
});

test("accepts only a complete, explicitly approved, scoped exception", () => {
  assert.equal(assertSublicensingPolicy(validException), true);
});
