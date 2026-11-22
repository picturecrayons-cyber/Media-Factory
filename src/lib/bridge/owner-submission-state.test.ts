import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  editableOwnerSubmissionStatus,
  ownerSubmissionReviewTransition,
  ownerSubmissionSubmitTransition,
} from "./owner-submission-state.ts";

describe("owner submission lifecycle state machine", () => {
  it("allows draft owners to save and submit", () => {
    assert.equal(editableOwnerSubmissionStatus("DRAFT"), "DRAFT");
    assert.deepEqual(ownerSubmissionSubmitTransition("DRAFT"), {
      action: "SUBMITTED",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
    });
  });

  it("keeps a requested-change state editable and records resubmission", () => {
    assert.equal(editableOwnerSubmissionStatus("NEEDS_CORRECTION"), "NEEDS_CORRECTION");
    assert.deepEqual(ownerSubmissionSubmitTransition("NEEDS_CORRECTION"), {
      action: "RESUBMITTED",
      fromStatus: "NEEDS_CORRECTION",
      toStatus: "SUBMITTED",
    });
  });

  it("locks owner editing while pending or after intake acceptance", () => {
    assert.throws(() => editableOwnerSubmissionStatus("SUBMITTED"), /locked/);
    assert.throws(() => editableOwnerSubmissionStatus("ACCEPTED_INTAKE"), /locked/);
    assert.throws(() => ownerSubmissionSubmitTransition("SUBMITTED"), /already pending/);
  });

  it("accepts only pending submissions and does not represent QC approval", () => {
    assert.deepEqual(ownerSubmissionReviewTransition("SUBMITTED", "ACCEPTED_INTAKE"), {
      action: "ACCEPTED_INTAKE",
      fromStatus: "SUBMITTED",
      toStatus: "ACCEPTED_INTAKE",
    });
    assert.throws(() => ownerSubmissionReviewTransition("DRAFT", "ACCEPTED_INTAKE"), /no longer pending/);
    assert.throws(() => ownerSubmissionReviewTransition("ACCEPTED_INTAKE", "REQUEST_CHANGES"), /no longer pending/);
  });

  it("requires the request-changes transition to end in the owner-correctable state", () => {
    assert.deepEqual(ownerSubmissionReviewTransition("SUBMITTED", "REQUEST_CHANGES"), {
      action: "REQUEST_CHANGES",
      fromStatus: "SUBMITTED",
      toStatus: "NEEDS_CORRECTION",
    });
  });
});
