import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedFinishedFilmPackage, hasVerifiedMasterAndArtwork } from "./asset-roles";

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


test("finished-film handoff requires master, current vertical poster, horizontal artwork and thumbnail", () => {
  const complete = [
    { kind: "master", s3_key: "verified/master" },
    { kind: "poster_vertical", s3_key: "verified/vertical" },
    { kind: "poster_horizontal", s3_key: "verified/horizontal" },
    { kind: "thumbnail", s3_key: "verified/thumbnail" },
  ];
  assert.equal(hasVerifiedFinishedFilmPackage(complete, "verified/master", "verified/vertical"), true);
  assert.equal(
    hasVerifiedFinishedFilmPackage(complete.slice(0, 3), "verified/master", "verified/vertical"),
    false,
  );
  assert.equal(
    hasVerifiedFinishedFilmPackage(
      complete.filter((asset) => asset.kind !== "poster_horizontal"),
      "verified/master",
      "verified/vertical",
    ),
    false,
  );
  assert.equal(
    hasVerifiedFinishedFilmPackage(complete, "verified/master", "stale/vertical"),
    false,
  );
});
