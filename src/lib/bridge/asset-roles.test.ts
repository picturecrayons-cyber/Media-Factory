import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedMasterAndArtwork } from "./asset-roles";

const exactVerticalArtwork = [
  { kind: "master", s3_key: "bridge/master.mp4.verified/asset-master" },
  { kind: "poster", s3_key: "bridge/poster-old.jpg.verified/asset-old" },
  { kind: "poster_vertical", s3_key: "bridge/poster-current.jpg.verified/asset-poster" },
];

test("accepts exact non-null master and current vertical poster pointers", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      exactVerticalArtwork,
      "bridge/master.mp4.verified/asset-master",
      "bridge/poster-current.jpg.verified/asset-poster",
    ),
    true,
  );
});

test("rejects null master or artwork pointers", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(exactVerticalArtwork, null, "bridge/poster-current.jpg.verified/asset-poster"),
    false,
  );
  assert.equal(
    hasVerifiedMasterAndArtwork(exactVerticalArtwork, "bridge/master.mp4.verified/asset-master", null),
    false,
  );
});

test("rejects an unreferenced legacy poster when the current pointer is vertical", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(exactVerticalArtwork, "bridge/master.mp4.verified/asset-master", "bridge/poster-stale.jpg.verified/asset-stale"),
    false,
  );
});

test("retains compatibility with a legacy poster when its pointer matches exactly", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      [{ kind: "master", s3_key: "bridge/master.mp4.verified/asset-master" }, { kind: "poster", s3_key: "bridge/poster.jpg.verified/asset-poster" }],
      "bridge/master.mp4.verified/asset-master",
      "bridge/poster.jpg.verified/asset-poster",
    ),
    true,
  );
});
