import test from "node:test";
import assert from "node:assert/strict";
import {
  MULTIPART_PART_SIZE,
  loadedBytes,
  multipartTargetAllowed,
  nextPart,
  partCount,
  partSlice,
  sameUploadFile,
} from "./multipart-upload.ts";

test("a film master splits into 16 MiB parts and keeps a short last part", () => {
  const size = MULTIPART_PART_SIZE * 2 + 10;
  assert.equal(partCount(size), 3);
  assert.deepEqual(partSlice(size, 3), { start: MULTIPART_PART_SIZE * 2, end: size });
  assert.equal(nextPart([1, 3], 3), 2);
  assert.equal(nextPart([1, 2, 3], 3), null);
  assert.equal(loadedBytes([1, 2], size), MULTIPART_PART_SIZE * 2);
});

test("resume only matches the same file", () => {
  const session = { fileName: "film.mp4", fileSize: 100, lastModified: 5 };
  assert.equal(sameUploadFile(session, { name: "film.mp4", size: 100, lastModified: 5 }), true);
  assert.equal(sameUploadFile(session, { name: "film.mp4", size: 101, lastModified: 5 }), false);
});

test("multipart commit target must be the asset object in the configured region", () => {
  const key = "bridge/owner/title/master/film.mp4";
  const good = `https://objectstorage.ap-mumbai-1.oraclecloud.com/p/token/n/ns/b/bucket/u/${key}/id/upload/`;
  assert.equal(multipartTargetAllowed(good, "ap-mumbai-1", key), true);
  assert.equal(multipartTargetAllowed(good, "us-phoenix-1", key), false);
  assert.equal(multipartTargetAllowed("https://example.com/p/token/u/film/id/upload/", "ap-mumbai-1", key), false);
  assert.equal(multipartTargetAllowed(`${good}?x=1`, "ap-mumbai-1", key), false);
});
