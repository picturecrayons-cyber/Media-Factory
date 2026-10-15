import test from "node:test";
import assert from "node:assert/strict";
import { summarizeEvidenceStatus } from "./rights-admin-policy.ts";

test("no evidence never verifies title rights", () => {
  assert.equal(summarizeEvidenceStatus([]), "MISSING");
});

test("pending evidence keeps rights pending even if another item is verified", () => {
  assert.equal(summarizeEvidenceStatus(["VERIFIED", "PENDING_REVIEW"]), "PENDING_REVIEW");
});

test("disputed evidence blocks verification", () => {
  assert.equal(summarizeEvidenceStatus(["VERIFIED", "DISPUTED"]), "DISPUTED");
});

test("rejected evidence blocks verification", () => {
  assert.equal(summarizeEvidenceStatus(["VERIFIED", "REJECTED"]), "REJECTED");
});

test("all resolved evidence can verify rights only when at least one item is verified", () => {
  assert.equal(summarizeEvidenceStatus(["VERIFIED", "SUPERSEDED"]), "VERIFIED");
  assert.equal(summarizeEvidenceStatus(["SUPERSEDED"]), "MISSING");
});
