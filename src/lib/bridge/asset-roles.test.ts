import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedMasterAndArtwork, pointsToVerifiedAsset } from "./asset-roles";

const assets = [
  { id: "master-id", kind: "master", s3_key: "bridge/title/master/file.mov" },
  { id: "poster-id", kind: "poster", s3_key: "bridge/title/poster/file.jpg" },
  { id: "vertical-id", kind: "poster_vertical", s3_key: "bridge/title/poster/vertical.jpg" },
];

test("accepts exact direct references", () => {
  assert.equal(hasVerifiedMasterAndArtwork(assets, "bridge/title/master/file.mov", "bridge/title/poster/file.jpg"), true);
});

test("accepts sealed pointers only when source key and immutable asset id both match", () => {
  assert.equal(pointsToVerifiedAsset("bridge/title/master/file.mov.verified/master-id", assets[0]), true);
  assert.equal(hasVerifiedMasterAndArtwork(assets,
    "bridge/title/master/file.mov.verified/master-id",
    "bridge/title/poster/vertical.jpg.verified/vertical-id"), true);
});

test("rejects incorrect sealed asset id or source key", () => {
  assert.equal(pointsToVerifiedAsset("bridge/title/master/file.mov.verified/wrong-id", assets[0]), false);
  assert.equal(pointsToVerifiedAsset("bridge/another/master/file.mov.verified/master-id", assets[0]), false);
});

test("rejects missing pointers and stale artwork", () => {
  assert.equal(hasVerifiedMasterAndArtwork(assets, null, "bridge/title/poster/file.jpg"), false);
  assert.equal(hasVerifiedMasterAndArtwork(assets, "bridge/title/master/file.mov", null), false);
  assert.equal(hasVerifiedMasterAndArtwork(assets, "bridge/title/master/file.mov", "stale/poster.jpg"), false);
});

test("preserves legacy direct-key poster compatibility", () => {
  assert.equal(hasVerifiedMasterAndArtwork([
    { id: "legacy-master", kind: "master", s3_key: "master" },
    { id: "legacy-poster", kind: "poster", s3_key: "poster" },
  ], "master", "poster"), true);
});
