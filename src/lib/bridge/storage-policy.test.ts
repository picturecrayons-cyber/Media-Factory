import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canDeleteAsset, evaluateStoragePolicy } from "./storage-policy.ts";

describe("storage policy", () => {
  const now = new Date("2026-10-08T00:00:00Z");

  it("keeps active Loop playback on Standard", () => {
    const result = evaluateStoragePolicy({
      assetKind: "screener",
      titleStatus: "LIVE_FOR_BUYERS",
      loopPublished: true,
      loopPlaybackActive: true,
      now,
      lastAccessedAt: new Date("2025-01-01T00:00:00Z"),
    });
    assert.equal(result.recommendedTier, "STANDARD");
    assert.equal(result.protected, true);
  });

  it("moves a cold active master recommendation to Infrequent", () => {
    const result = evaluateStoragePolicy({
      assetKind: "master",
      titleStatus: "LIVE_FOR_BUYERS",
      now,
      lastAccessedAt: new Date("2026-05-01T00:00:00Z"),
    });
    assert.equal(result.recommendedTier, "INFREQUENT");
    assert.equal(result.protected, true);
  });

  it("allows Archive only for explicit preservation", () => {
    const result = evaluateStoragePolicy({
      assetKind: "master",
      titleStatus: "DELIVERED",
      businessState: "PRESERVATION",
      now,
    });
    assert.equal(result.recommendedTier, "ARCHIVE");
    assert.deepEqual(result.allowedTiers, ["INFREQUENT", "ARCHIVE"]);
  });

  it("never deletes a sole master", () => {
    assert.equal(
      canDeleteAsset({
        assetKind: "master",
        titleStatus: "DELIVERED",
        businessState: "ABANDONED",
        retentionUntil: new Date("2026-01-01T00:00:00Z"),
        isSoleMaster: true,
        now,
      }),
      false,
    );
  });

  it("permits deletion only after retention for abandoned temporary data", () => {
    assert.equal(
      canDeleteAsset({
        assetKind: "proxy",
        titleStatus: "DELIVERED",
        businessState: "ABANDONED",
        retentionUntil: new Date("2026-01-01T00:00:00Z"),
        isSoleMaster: false,
        isInActivePackage: false,
        now,
      }),
      true,
    );
  });
});
