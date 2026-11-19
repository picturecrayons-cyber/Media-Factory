import assert from "node:assert/strict";
import test from "node:test";
import { parseSingleByteRange, validateMediaResponse } from "./media-range.ts";

test("parses explicit, open-ended and suffix byte ranges", () => {
  assert.deepEqual(parseSingleByteRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseSingleByteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(parseSingleByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseSingleByteRange("bytes=-200", 100), { start: 0, end: 99 });
  assert.equal(parseSingleByteRange(null, 100), null);
});

test("rejects malformed, multiple and unsatisfiable byte ranges", () => {
  for (const value of ["bytes=1-2,4-5", "bytes=-0", "bytes=100-", "bytes=9-2", "items=1-2", "bytes=-"]) {
    assert.throws(() => parseSingleByteRange(value, 100), RangeError);
  }
});

test("requires exact 206 interval and byte count for range responses", () => {
  const base = {
    status: 206,
    contentRange: "bytes 10-19/100",
    contentLength: "10",
    requestedRange: { start: 10, end: 19 },
    totalBytes: 100,
    expectedContentType: "video/mp4",
    actualContentType: "video/mp4",
  };
  assert.equal(validateMediaResponse(base), true);
  assert.equal(validateMediaResponse({ ...base, status: 200 }), false);
  assert.equal(validateMediaResponse({ ...base, contentRange: "bytes 0-9/100" }), false);
  assert.equal(validateMediaResponse({ ...base, contentLength: "9" }), false);
  assert.equal(validateMediaResponse({ ...base, contentRange: "bytes 10-19/101" }), false);
});

test("requires a complete 200 response when no range was requested", () => {
  const base = {
    status: 200,
    contentRange: null,
    contentLength: "100",
    requestedRange: null,
    totalBytes: 100,
    expectedContentType: "video/mp4",
    actualContentType: "video/mp4",
  };
  assert.equal(validateMediaResponse(base), true);
  assert.equal(validateMediaResponse({ ...base, status: 206 }), false);
  assert.equal(validateMediaResponse({ ...base, contentLength: "99" }), false);
  assert.equal(validateMediaResponse({ ...base, contentRange: "bytes 0-99/100" }), false);
  assert.equal(validateMediaResponse({ ...base, actualContentType: "image/png" }), false);
});
