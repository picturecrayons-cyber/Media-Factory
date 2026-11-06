import test from "node:test";
import assert from "node:assert/strict";
import { assertImmutableVerifiedPointer, validatePartManifest } from "./upload-manifest.ts";

const PART = 10_485_760;
const SIZE = 11_000_000;

test("accepts contiguous OCI parts and an undersized final part", () => {
  const result = validatePartManifest([
    { partNumber: 2, byteStart: PART, byteEnd: SIZE, etag: "etag-2" },
    { partNumber: 1, byteStart: 0, byteEnd: PART, etag: "etag-1" },
  ], { expectedSize: SIZE, partSize: PART });
  assert.deepEqual(result.map((part) => part.partNumber), [1, 2]);
});

test("rejects gaps, overlaps, missing parts, bad ETags and wrong total size", () => {
  const base = [
    { partNumber: 1, byteStart: 0, byteEnd: PART, etag: "etag-1" },
    { partNumber: 2, byteStart: PART, byteEnd: SIZE, etag: "etag-2" },
  ];
  assert.throws(() => validatePartManifest([{ ...base[0], byteEnd: PART - 1 }, base[1]], {
    expectedSize: SIZE, partSize: PART,
  }), /contiguous/);
  assert.throws(() => validatePartManifest([base[0]], {
    expectedSize: SIZE, partSize: PART,
  }), /expected file size/);
  assert.throws(() => validatePartManifest([{ ...base[0], etag: "\r\n" }, base[1]], {
    expectedSize: SIZE, partSize: PART,
  }), /ETag/);
});

test("verified object pointer cannot be silently replaced", () => {
  assert.equal(assertImmutableVerifiedPointer({ currentVerifiedKey: null, nextVerifiedKey: "sealed/a" }), undefined);
  assert.throws(() => assertImmutableVerifiedPointer({
    currentVerifiedKey: "sealed/a", nextVerifiedKey: "sealed/b",
  }), /immutable/);
});
