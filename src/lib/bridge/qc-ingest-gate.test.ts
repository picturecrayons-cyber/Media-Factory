import test from "node:test";
import assert from "node:assert/strict";
import { evaluateVerifiedTitleIngestReadiness, REQUIRED_QC_ASSET_SLOTS, type QCIngestAssetEvidence } from "./qc-ingest-gate.ts";

const digest = "a".repeat(64);
function completeAssets(): QCIngestAssetEvidence[] {
  return REQUIRED_QC_ASSET_SLOTS.map(({ kinds }, index) => ({
    kind: kinds[0], s3Key: `asset-${index}.verified/asset-${index}`,
    byteSize: 100 + index, checksumSha256: digest, provenanceVerified: true,
  }));
}

test("QC ingest gate requires all seven independently verified assets", () => {
  const assets = completeAssets();
  assert.deepEqual(evaluateVerifiedTitleIngestReadiness(assets, { masterKey: assets[0].s3Key, posterKey: assets[2].s3Key }), { ready: true, missingSlots: [] });
});
test("QC ingest gate blocks missing, unverified, empty and checksum-less assets", () => {
  const assets = completeAssets();
  assets[1].provenanceVerified = false; assets[2].checksumSha256 = null; assets[3].byteSize = 0;
  const result = evaluateVerifiedTitleIngestReadiness(assets, { masterKey: assets[0].s3Key, posterKey: assets[2].s3Key });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingSlots, ["Screener / Trailer", "Vertical poster", "Horizontal artwork"]);
});
test("QC ingest gate requires the title master reference to match the verified master", () => {
  const assets = completeAssets();
  const result = evaluateVerifiedTitleIngestReadiness(assets, { masterKey: "different-key", posterKey: assets[2].s3Key });
  assert.equal(result.ready, false); assert.ok(result.missingSlots.includes("Main film"));
});