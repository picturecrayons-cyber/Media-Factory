import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  editableOwnerSubmissionStatus,
  ownerSubmissionReviewTransition,
  ownerSubmissionSubmitTransition,
  ownerSubmissionWithdrawTransition,
  assertSubmissionDecisionReason,
} from "./owner-submission-state.ts";

describe("owner submission lifecycle state machine", () => {
  it("allows draft owners to submit and correction states to resubmit", () => {
    assert.equal(editableOwnerSubmissionStatus("DRAFT"), "DRAFT");
    assert.deepEqual(ownerSubmissionSubmitTransition("DRAFT"), { action: "SUBMITTED", fromStatus: "DRAFT", toStatus: "SUBMITTED" });
    assert.equal(editableOwnerSubmissionStatus("NEEDS_CORRECTION"), "NEEDS_CORRECTION");
    assert.deepEqual(ownerSubmissionSubmitTransition("NEEDS_CORRECTION"), { action: "RESUBMITTED", fromStatus: "NEEDS_CORRECTION", toStatus: "SUBMITTED" });
  });
  it("locks editing while submitted, accepted, withdrawn or rejected", () => {
    for (const status of ["SUBMITTED", "ACCEPTED_INTAKE", "WITHDRAWN", "REJECTED"]) {
      assert.throws(() => editableOwnerSubmissionStatus(status), /locked/);
    }
  });
  it("allows only pending submissions to withdraw", () => {
    assert.deepEqual(ownerSubmissionWithdrawTransition("SUBMITTED"), { action: "WITHDRAWN", fromStatus: "SUBMITTED", toStatus: "WITHDRAWN" });
    for (const status of ["DRAFT", "NEEDS_CORRECTION", "ACCEPTED_INTAKE", "WITHDRAWN", "REJECTED"]) {
      assert.throws(() => ownerSubmissionWithdrawTransition(status), /pending/);
    }
  });
  it("allows Super Admin rejection only for pending submissions", () => {
    assert.deepEqual(ownerSubmissionReviewTransition("SUBMITTED", "REJECTED"), { action: "REJECTED", fromStatus: "SUBMITTED", toStatus: "REJECTED" });
    assert.throws(() => ownerSubmissionReviewTransition("DRAFT", "REJECTED"), /no longer pending/);
  });
  it("preserves acceptance and request-changes as separate decisions", () => {
    assert.deepEqual(ownerSubmissionReviewTransition("SUBMITTED", "ACCEPTED_INTAKE"), { action: "ACCEPTED_INTAKE", fromStatus: "SUBMITTED", toStatus: "ACCEPTED_INTAKE" });
    assert.deepEqual(ownerSubmissionReviewTransition("SUBMITTED", "REQUEST_CHANGES"), { action: "REQUEST_CHANGES", fromStatus: "SUBMITTED", toStatus: "NEEDS_CORRECTION" });
  });
  it("requires bounded mandatory decision reasons", () => {
    assert.throws(() => assertSubmissionDecisionReason(" "), /reason/);
    assert.throws(() => assertSubmissionDecisionReason("x"), /reason/);
    assert.equal(assertSubmissionDecisionReason(" duplicate record "), "duplicate record");
  });
});
