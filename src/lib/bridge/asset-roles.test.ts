import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedMasterAndArtwork } from "./asset-roles";

const exactVerticalArtwork = [
  { kind: "master", s3_key: "verified/master" },
  { kind: "poster", s3_key: "older/unreferenced-poster" },
  { kind: "poster_vertical", s3_key: "verified/current-vertical-poster" },
];

test("accepts exact non-null master and current vertical poster pointers", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      exactVerticalArtwork,
      "verified/master",
      "verified/current-vertical-poster",
    ),
    true,
  );
});

test("rejects null master or artwork pointers", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(exactVerticalArtwork, null, "verified/current-vertical-poster"),
    false,
  );
  assert.equal(
    hasVerifiedMasterAndArtwork(exactVerticalArtwork, "verified/master", null),
    false,
  );
});

test("rejects an unreferenced legacy poster when the current pointer is vertical", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(exactVerticalArtwork, "verified/master", "stale/poster"),
    false,
  );
});

test("retains compatibility with a legacy poster when its pointer matches exactly", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      [{ kind: "master", s3_key: "verified/master" }, { kind: "poster", s3_key: "verified/poster" }],
      "verified/master",
      "verified/poster",
    ),
    true,
  );
});
