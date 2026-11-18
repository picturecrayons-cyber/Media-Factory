import assert from "node:assert/strict";
import test from "node:test";
import {
  ditManifestDigest,
  ditManifestTotals,
  normalizeDitFiles,
  type DitManifestFile,
} from "./dit-manifest.ts";

const a = "a".repeat(64);
const b = "b".repeat(64);

test("normalizes separators, checksum casing and deterministic manifest order", () => {
  const files = normalizeDitFiles([
    { relativePath: "CAM_A\\clip-02.mov", byteSize: 20, sha256: b.toUpperCase() },
    { relativePath: "CAM_A/clip-01.mov", byteSize: 10, sha256: a },
  ]);
  assert.deepEqual(files, [
    { relativePath: "CAM_A/clip-01.mov", byteSize: 10, sha256: a },
    { relativePath: "CAM_A/clip-02.mov", byteSize: 20, sha256: b },
  ]);
  assert.equal(ditManifestDigest(files), ditManifestDigest([...files].reverse()));
});

test("rejects absolute, drive-qualified, traversal and malformed paths", () => {
  for (const relativePath of [
    "/root/clip.mov",
    "C:\\camera\\clip.mov",
    "../clip.mov",
    "camera/../clip.mov",
    "camera/./clip.mov",
    "camera//clip.mov",
    "camera/clip.mov/",
    "camera\\0clip.mov",
  ]) {
    assert.throws(
      () => normalizeDitFiles([{ relativePath, byteSize: 1, sha256: a }]),
      /Unsafe relative path/,
      relativePath,
    );
  }
});

test("rejects case-colliding paths and duplicate paths", () => {
  assert.throws(() => normalizeDitFiles([
    { relativePath: "Camera/Clip.mov", byteSize: 1, sha256: a },
    { relativePath: "camera/clip.mov", byteSize: 1, sha256: a },
  ]), /Duplicate or case-colliding path/);
  assert.throws(() => normalizeDitFiles([
    { relativePath: "camera/clip.mov", byteSize: 1, sha256: a },
    { relativePath: "camera/clip.mov", byteSize: 1, sha256: a },
  ]), /Duplicate or case-colliding path/);
});

test("rejects invalid sizes and checksums", () => {
  for (const byteSize of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    assert.throws(() => normalizeDitFiles([{ relativePath: "clip.mov", byteSize, sha256: a }]), /Invalid byte size/);
  }
  for (const sha256 of ["", "x".repeat(64), "a".repeat(63), "a".repeat(65)]) {
    assert.throws(() => normalizeDitFiles([{ relativePath: "clip.mov", byteSize: 1, sha256 }]), /Invalid SHA-256/);
  }
});

test("rejects empty, oversized and non-array manifests", () => {
  assert.throws(() => normalizeDitFiles(null), /must be an array/);
  assert.throws(() => normalizeDitFiles([]), /contains no files/);
  assert.throws(() => normalizeDitFiles(Array.from({ length: 10001 }, (_, i) => ({
    relativePath: `clip-${i}.mov`, byteSize: 1, sha256: a,
  }))), /limited to 10,000 files/);
});

test("computes safe file and byte totals without rounding", () => {
  const files: DitManifestFile[] = [
    { relativePath: "a.mov", byteSize: 9007199254740000, sha256: a },
    { relativePath: "b.mov", byteSize: 100, sha256: b },
  ];
  assert.deepEqual(ditManifestTotals(files), { fileCount: 2, totalBytes: 9007199254740100 });
  assert.throws(() => ditManifestTotals([
    { relativePath: "a.mov", byteSize: Number.MAX_SAFE_INTEGER, sha256: a },
    { relativePath: "b.mov", byteSize: 1, sha256: b },
  ]), /safe integer limit/);
});
