import assert from "node:assert/strict";
import test from "node:test";
import { canReviewBuyerEvidence } from "./buyer-evidence-policy.ts";

test("allows an independent reviewer to review pending evidence in a pending organization/mandate", () => {
  assert.equal(canReviewBuyerEvidence({
    evidenceStatus: "pending",
    parentStatus: "pending_review",
    uploadedBy: "buyer-user",
    reviewerId: "legal-reviewer",
  }), true);
});

test("denies evidence after its parent review is completed", () => {
  for (const parentStatus of ["verified", "approved", "rejected", "suspended", "revoked"]) {
    assert.equal(canReviewBuyerEvidence({
      evidenceStatus: "pending",
      parentStatus,
      uploadedBy: "buyer-user",
      reviewerId: "legal-reviewer",
    }), false);
  }
});

test("denies already reviewed evidence and self-review", () => {
  assert.equal(canReviewBuyerEvidence({
    evidenceStatus: "accepted",
    parentStatus: "pending_review",
    uploadedBy: "buyer-user",
    reviewerId: "legal-reviewer",
  }), false);
  assert.equal(canReviewBuyerEvidence({
    evidenceStatus: "pending",
    parentStatus: "pending_review",
    uploadedBy: "same-user",
    reviewerId: "same-user",
  }), false);
});
