import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedMasterAndArtwork } from "./asset-roles";

const exactVerticalArtwork = [
  { id: "master-id", kind: "master", s3_key: "bridge/title/master/final.mov" },
  { id: "poster-id", kind: "poster", s3_key: "bridge/title/poster/final.jpg" },
  { id: "vertical-id", kind: "poster_vertical", s3_key: "bridge/title/poster/vertical.jpg" },
];

test("accepts exact non-null master and current vertical poster pointers", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      exactVerticalArtwork,
      "bridge/title/master/final.mov",
      "bridge/title/poster/vertical.jpg",
    ),
    true,
  );
});

test("accepts a sealed verified master pointer only when its suffix matches the same asset row id", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      exactVerticalArtwork,
      "bridge/title/master/final.mov.verified/master-id",
      "bridge/title/poster/final.jpg",
    ),
    true,
  );
});

test("rejects a sealed pointer whose asset id does not match the canonical row", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      exactVerticalArtwork,
      "bridge/title/master/final.mov.verified/some-other-asset",
      "bridge/title/poster/final.jpg",
    ),
    false,
  );
});

test("rejects a sealed pointer whose original object key does not match", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      exactVerticalArtwork,
      "bridge/another-title/master/final.mov.verified/master-id",
      "bridge/title/poster/final.jpg",
    ),
    false,
  );
});

test("rejects null master or artwork pointers", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(exactVerticalArtwork, null, "bridge/title/poster/vertical.jpg"),
    false,
  );
  assert.equal(
    hasVerifiedMasterAndArtwork(exactVerticalArtwork, "bridge/title/master/final.mov", null),
    false,
  );
});

test("rejects an unreferenced legacy poster", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      exactVerticalArtwork,
      "bridge/title/master/final.mov",
      "bridge/title/poster/stale.jpg",
    ),
    false,
  );
});

test("retains compatibility with legacy direct pointers", () => {
  assert.equal(
    hasVerifiedMasterAndArtwork(
      [{ id: "master-id", kind: "master", s3_key: "master" }, { id: "poster-id", kind: "poster", s3_key: "poster" }],
      "master",
      "poster",
    ),
    true,
  );
});
