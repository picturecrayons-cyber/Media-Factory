import test from "node:test";
import assert from "node:assert/strict";
import { assertImmutableVerifiedPointer, validatePartManifest } from "./upload-manifest.ts";

test("accepts a contiguous complete manifest with an undersized final part", () => {
  const result = validatePartManifest([
    { partNumber: 2, byteStart: 5_242_880, byteEnd: 6_000_000, etag: "etag-2" },
    { partNumber: 1, byteStart: 0, byteEnd: 5_242_880, etag: "etag-1" },
  ], { expectedSize: 6_000_000, partSize: 5_242_880 });
  assert.deepEqual(result.map((part) => part.partNumber), [1, 2]);
});

test("rejects gaps, overlaps, missing parts, bad ETags and wrong total size", () => {
  const base = [
    { partNumber: 1, byteStart: 0, byteEnd: 5_242_880, etag: "etag-1" },
    { partNumber: 2, byteStart: 5_242_880, byteEnd: 6_000_000, etag: "etag-2" },
  ];
  assert.throws(() => validatePartManifest([{ ...base[0], byteEnd: 5_000_000 }, base[1]], {
    expectedSize: 6_000_000, partSize: 5_242_880,
  }), /contiguous/);
  assert.throws(() => validatePartManifest([base[0]], {
    expectedSize: 6_000_000, partSize: 5_242_880,
  }), /expected file size/);
  assert.throws(() => validatePartManifest([{ ...base[0], etag: "\r\n" }, base[1]], {
    expectedSize: 6_000_000, partSize: 5_242_880,
  }), /ETag/);
});

test("verified object pointer cannot be silently replaced", () => {
  assert.equal(assertImmutableVerifiedPointer({ currentVerifiedKey: null, nextVerifiedKey: "sealed/a" }), undefined);
  assert.throws(() => assertImmutableVerifiedPointer({
    currentVerifiedKey: "sealed/a", nextVerifiedKey: "sealed/b",
  }), /immutable/);
});
