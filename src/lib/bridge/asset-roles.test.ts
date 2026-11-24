import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedMasterAndArtwork } from "./asset-roles";

const assets = [
  { id: "master-id", kind: "master", s3_key: "bridge/title/master/final.mov" },
  { id: "poster-id", kind: "poster", s3_key: "bridge/title/poster/final.jpg" },
  { id: "vertical-id", kind: "poster_vertical", s3_key: "bridge/title/poster/vertical.jpg" },
];

test("accepts exact direct master and vertical artwork pointers", () => {
  assert.equal(hasVerifiedMasterAndArtwork(assets, "bridge/title/master/final.mov", "bridge/title/poster/vertical.jpg"), true);
});

test("accepts sealed pointers only when original key and asset row ID match", () => {
  assert.equal(hasVerifiedMasterAndArtwork(
    assets,
    "bridge/title/master/final.mov.verified/master-id",
    "bridge/title/poster/vertical.jpg.verified/vertical-id",
  ), true);
});

test("rejects a sealed pointer with a different asset ID", () => {
  assert.equal(hasVerifiedMasterAndArtwork(
    assets,
    "bridge/title/master/final.mov.verified/other-id",
    "bridge/title/poster/vertical.jpg",
  ), false);
});

test("rejects a sealed pointer with a different original object key", () => {
  assert.equal(hasVerifiedMasterAndArtwork(
    assets,
    "bridge/other-title/master/final.mov.verified/master-id",
    "bridge/title/poster/vertical.jpg",
  ), false);
});

test("rejects null pointers and stale, unreferenced artwork", () => {
  assert.equal(hasVerifiedMasterAndArtwork(assets, null, "bridge/title/poster/vertical.jpg"), false);
  assert.equal(hasVerifiedMasterAndArtwork(assets, "bridge/title/master/final.mov", null), false);
  assert.equal(hasVerifiedMasterAndArtwork(assets, "bridge/title/master/final.mov", "bridge/title/poster/stale.jpg"), false);
});

test("retains legacy direct-key poster compatibility", () => {
  assert.equal(hasVerifiedMasterAndArtwork([
    { id: "master-id", kind: "master", s3_key: "master" },
    { id: "poster-id", kind: "poster", s3_key: "poster" },
  ], "master", "poster"), true);
});
