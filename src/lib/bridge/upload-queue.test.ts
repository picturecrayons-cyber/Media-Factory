import test from "node:test";
import assert from "node:assert/strict";
import { classifyUploadFiles, uploadFileIdentity } from "./upload-queue.ts";

function file(name: string, size = 100, lastModified = 1) {
  return { name, size, lastModified };
}

test("mixed drag/drop selection maps files to package slots in order", () => {
  const result = classifyUploadFiles([
    file("film.mp4"),
    file("trailer.mov"),
    file("poster.jpg"),
    file("landscape.webp"),
    file("thumb.png"),
    file("captions.srt"),
    file("certificate.pdf"),
  ]);
  assert.deepEqual(result.map((item) => item.kind), [
    "master", "screener", "poster_vertical", "poster_horizontal",
    "thumbnail", "subtitle", "censor_certificate",
  ]);
});

test("duplicate selections are ignored and never create duplicate queue entries", () => {
  const duplicate = file("film.mp4", 200, 7);
  const result = classifyUploadFiles([duplicate, { ...duplicate }, file("trailer.mp4", 300, 8)]);
  assert.equal(result.length, 2);
  assert.equal(result[0].identity, uploadFileIdentity(duplicate));
});

test("unsupported or excess files are not silently assigned to the wrong package slot", () => {
  const result = classifyUploadFiles([
    file("one.mp4"), file("two.mov"), file("three.mxf"),
    file("one.jpg"), file("two.jpg"), file("three.jpg"), file("four.jpg"),
    file("readme.txt"),
  ]);
  assert.deepEqual(result.map((item) => item.kind), [
    "master", "screener", "poster_vertical", "poster_horizontal", "thumbnail",
  ]);
});
