import assert from "node:assert/strict";
import test from "node:test";
import {
  canRequestVendorJob,
  deliveryFinalGate,
  isFinishedFilmSubmission,
  isValidSha256Receipt,
  isValidVendorReceiptKey,
} from "./delivery-job-policy.ts";

test("only finished-film submissions enter the vendor delivery workflow", () => {
  assert.equal(isFinishedFilmSubmission("finished_film"), true);
  assert.equal(isFinishedFilmSubmission("story_concept"), false);
  assert.equal(canRequestVendorJob({ submissionType: "story_concept", actorCanReadTitle: true, actorCanManageDelivery: true, accountType: "studio" }), false);
});

test("vendor requests require owner visibility or an authorized delivery operator", () => {
  assert.equal(canRequestVendorJob({ submissionType: "finished_film", actorCanReadTitle: true, actorCanManageDelivery: false, accountType: "studio" }), true);
  assert.equal(canRequestVendorJob({ submissionType: "finished_film", actorCanReadTitle: false, actorCanManageDelivery: false, accountType: "studio" }), false);
  assert.equal(canRequestVendorJob({ submissionType: "finished_film", actorCanReadTitle: false, actorCanManageDelivery: true, accountType: "buyer" }), true);
  assert.equal(canRequestVendorJob({ submissionType: "finished_film", actorCanReadTitle: false, actorCanManageDelivery: false, accountType: "buyer" }), false);
});

test("final delivery requires every independent Bridge gate", () => {
  const ready = {
    submissionType: "finished_film", lifecycleReady: true, qcPassedForCurrentAssets: true,
    legalApproved: true, rightsGrantValid: true, packagingComplete: true, finalDeliveryGateReady: true,
  };
  assert.deepEqual(deliveryFinalGate(ready), { ready: true, reasons: [] });
  for (const key of ["qcPassedForCurrentAssets","legalApproved","rightsGrantValid","packagingComplete","finalDeliveryGateReady"] as const) {
    const result = deliveryFinalGate({ ...ready, [key]: false });
    assert.equal(result.ready, false, key);
    assert.ok(result.reasons.length > 0, key);
  }
  assert.equal(deliveryFinalGate({ ...ready, submissionType: "story_concept" }).ready, false);
});

test("vendor receipt evidence requires a scoped object key and a SHA-256 digest", () => {
  assert.equal(isValidVendorReceiptKey("bridge-private/vendor-delivery-receipts/job-1/receipt.pdf", "job-1"), true);
  assert.equal(isValidVendorReceiptKey("bridge-private/vendor-delivery-receipts/job-2/receipt.pdf", "job-1"), false);
  assert.equal(isValidVendorReceiptKey("bridge-private/vendor-delivery-receipts/job-1/../other", "job-1"), false);
  assert.equal(isValidSha256Receipt("a".repeat(64)), true);
  assert.equal(isValidSha256Receipt("not-a-digest"), false);
});
