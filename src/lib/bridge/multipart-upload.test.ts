import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertExpectedUploadSize,
  assertMultipartEtags,
  multipartPartCount,
} from "./multipart-upload.ts";

test("multipart part count uses fixed-size chunks and enforces OCI limits", () => {
  assert.equal(multipartPartCount(1, 16), 1);
  assert.equal(multipartPartCount(16, 16), 1);
  assert.equal(multipartPartCount(17, 16), 2);
  assert.throws(() => multipartPartCount(0, 16), /positive safe integer/);
  assert.throws(() => multipartPartCount(160_001, 16), /OCI multipart upload limits/);
});

test("multipart completion refuses missing ETags and incomplete part lists", () => {
  assert.deepEqual(assertMultipartEtags(["etag-a", "etag-b"], 2), ["etag-a", "etag-b"]);
  assert.throws(() => assertMultipartEtags(["etag-a", undefined], 2), /missing one or more part ETags/);
  assert.throws(() => assertMultipartEtags(["etag-a"], 2), /missing one or more part ETags/);
  assert.throws(() => assertMultipartEtags(["etag-a", "  "], 2), /missing one or more part ETags/);
});

test("server confirmation rejects a multipart object whose size differs from the selected file", () => {
  assert.doesNotThrow(() => assertExpectedUploadSize(1024, 1024));
  assert.doesNotThrow(() => assertExpectedUploadSize(1024));
  assert.throws(() => assertExpectedUploadSize(1023, 1024), /size does not match/);
  assert.throws(() => assertExpectedUploadSize(0, 0), /object is empty/);
});
