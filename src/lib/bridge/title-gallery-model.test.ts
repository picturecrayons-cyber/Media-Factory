import test from "node:test";
import assert from "node:assert/strict";
import { selectVerifiedOriginalPoster, type GalleryPosterAsset } from "./title-gallery-model.ts";

const asset = (overrides: Partial<GalleryPosterAsset> = {}): GalleryPosterAsset => ({
  id: "asset-default",
  kind: "poster_vertical",
  contentType: "image/jpeg",
  verified: true,
  ...overrides,
});

test("prefers a verified vertical poster over a verified poster", () => {
  const poster = asset({ id: "poster", kind: "poster" });
  const vertical = asset({ id: "vertical", kind: "poster_vertical" });
  assert.equal(selectVerifiedOriginalPoster([poster, vertical])?.id, "vertical");
});

test("uses a verified poster when no vertical poster exists", () => {
  const poster = asset({ id: "poster", kind: "poster" });
  assert.equal(selectVerifiedOriginalPoster([poster])?.id, "poster");
});

test("does not substitute thumbnails or unverified/non-image assets", () => {
  const candidates = [
    asset({ id: "thumbnail", kind: "thumbnail" }),
    asset({ id: "unverified", verified: false }),
    asset({ id: "video", contentType: "video/mp4" }),
  ];
  assert.equal(selectVerifiedOriginalPoster(candidates), undefined);
});

test("returns no poster for an empty asset list", () => {
  assert.equal(selectVerifiedOriginalPoster([]), undefined);
});
