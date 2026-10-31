import test from "node:test";
import assert from "node:assert/strict";
import { buildTitleWorkflowProgress, isCurrentArtworkAsset } from "./title-workflow-readiness.ts";

test("vertical and horizontal artwork satisfy the current artwork key gate", () => {
  assert.equal(isCurrentArtworkAsset("poster_vertical", "vertical-key", "vertical-key"), true);
  assert.equal(isCurrentArtworkAsset("poster_horizontal", "horizontal-key", "horizontal-key"), true);
  assert.equal(isCurrentArtworkAsset("poster", "poster-key", "vertical-key"), false);
  assert.equal(isCurrentArtworkAsset("poster_vertical", "old-key", "current-key"), false);
  assert.equal(isCurrentArtworkAsset("thumbnail", "thumbnail-key", "thumbnail-key"), false);
  assert.equal(isCurrentArtworkAsset("poster_vertical", "key", null), false);
});

test("workflow progress is calculated from explicit gates, not title lifecycle alone", () => {
  const progress = buildTitleWorkflowProgress({
    metadataComplete: true,
    verifiedMaster: true,
    verifiedArtwork: true,
    privateScreener: true,
    qcPassed: false,
    rightsGrantValid: false,
    rightsEvidenceReady: false,
    legalApproved: false,
    legalEvidenceReady: false,
    destinationPackageReady: false,
    loopPublicationActive: false,
  });
  assert.equal(progress.completed, 4);
  assert.equal(progress.total, 11);
  assert.equal(progress.percent, 36);
  assert.equal(progress.nextGate?.id, "qcPassed");
  assert.equal(progress.nextGate?.owner, "QC Reviewer");
});
