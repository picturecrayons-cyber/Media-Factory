import test from "node:test";
import assert from "node:assert/strict";
import { ditManifestDigest, ditManifestTotals, normalizeDitFiles } from "./dit-manifest.ts";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

test("normalizes and sorts file paths before hashing", () => {
  const input = [
    { relativePath: "B/clip.mov", byteSize: 22, sha256: hashB },
    { relativePath: "A/clip.mov", byteSize: 11, sha256: hashA },
  ];
  const normalized = normalizeDitFiles(input);
  assert.deepEqual(normalized.map((file) => file.relativePath), ["A/clip.mov", "B/clip.mov"]);
  assert.equal(ditManifestDigest(input), ditManifestDigest([...input].reverse()));
  assert.deepEqual(ditManifestTotals(normalized), { fileCount: 2, totalBytes: 33 });
});

test("rejects traversal, absolute paths, and duplicate/case-colliding paths", () => {
  assert.throws(() => normalizeDitFiles([{ relativePath: "../outside.mov", byteSize: 1, sha256: hashA }]), /Unsafe relative path/);
  assert.throws(() => normalizeDitFiles([{ relativePath: "/volume/clip.mov", byteSize: 1, sha256: hashA }]), /Unsafe relative path/);
  assert.throws(() => normalizeDitFiles([
    { relativePath: "A/Clip.mov", byteSize: 1, sha256: hashA },
    { relativePath: "a/clip.mov", byteSize: 1, sha256: hashA },
  ]), /Duplicate or case-colliding/);
});

test("rejects malformed checksums, sizes, empty manifests and excessive file counts", () => {
  assert.throws(() => normalizeDitFiles([]), /contains no files/);
  assert.throws(() => normalizeDitFiles([{ relativePath: "clip.mov", byteSize: -1, sha256: hashA }]), /Invalid byte size/);
  assert.throws(() => normalizeDitFiles([{ relativePath: "clip.mov", byteSize: 1, sha256: "bad" }]), /Invalid SHA-256/);
  assert.throws(() => normalizeDitFiles(Array.from({ length: 10001 }, (_, i) => ({
    relativePath: `file-${i}.mov`, byteSize: 1, sha256: hashA,
  }))), /10,000 files/);
});

test("rejects unsafe aggregate sizes", () => {
  assert.throws(() => ditManifestTotals([
    { relativePath: "a.mov", byteSize: Number.MAX_SAFE_INTEGER, sha256: hashA },
    { relativePath: "b.mov", byteSize: 1, sha256: hashB },
  ]), /safe integer limit/);
});
