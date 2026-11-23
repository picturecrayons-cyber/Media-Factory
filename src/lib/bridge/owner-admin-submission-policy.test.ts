import assert from "node:assert/strict";
import test from "node:test";
import {
  canResubmitOwnerAdminSubmission,
  evaluateOwnerAdminSubmissionReadiness,
} from "./owner-admin-submission-policy";

const ready = {
  titleStatus: "PREPARING",
  masterKey: "canonical/master",
  posterKey: "canonical/poster",
  masterAssetVerified: true,
  artworkAssetVerified: true,
  activeStudioMembership: true,
};

test("allows a Creator or active Studio owner only when canonical master and artwork are verified", () => {
  assert.equal(evaluateOwnerAdminSubmissionReadiness(ready).eligible, true);
});

test("blocks submission when the verified master does not match the canonical key", () => {
  assert.equal(evaluateOwnerAdminSubmissionReadiness({ ...ready, masterAssetVerified: false }).eligible, false);
});

test("blocks submission when canonical artwork is missing or unverified", () => {
  assert.equal(evaluateOwnerAdminSubmissionReadiness({ ...ready, posterKey: null }).eligible, false);
  assert.equal(evaluateOwnerAdminSubmissionReadiness({ ...ready, artworkAssetVerified: false }).eligible, false);
});

test("blocks Studio submission when active organization membership is absent", () => {
  assert.equal(evaluateOwnerAdminSubmissionReadiness({ ...ready, activeStudioMembership: false }).eligible, false);
});

test("blocks submission unless the title remains PREPARING", () => {
  assert.equal(evaluateOwnerAdminSubmissionReadiness({ ...ready, titleStatus: "QC_REVIEW" }).eligible, false);
});

test("prevents duplicate pending submissions but allows a first or correction resubmission", () => {
  assert.equal(canResubmitOwnerAdminSubmission(null), true);
  assert.equal(canResubmitOwnerAdminSubmission("DRAFT"), true);
  assert.equal(canResubmitOwnerAdminSubmission("NEEDS_CORRECTION"), true);
  assert.equal(canResubmitOwnerAdminSubmission("SUBMITTED"), false);
});
