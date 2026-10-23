import assert from "node:assert/strict";
import test from "node:test";
import { resolveProfilePhotoUrl } from "./profile-photo.ts";

test("prefers the HTTPS avatar_url provider field", () => {
  assert.equal(
    resolveProfilePhotoUrl({
      avatar_url: "https://lh3.googleusercontent.com/a/example",
      picture: "https://example.com/other.png",
    }),
    "https://lh3.googleusercontent.com/a/example",
  );
});

test("falls back to HTTPS picture metadata when avatar_url is unsafe", () => {
  assert.equal(
    resolveProfilePhotoUrl({
      avatar_url: "http://example.com/avatar.png",
      picture: "https://example.com/picture.png",
    }),
    "https://example.com/picture.png",
  );
});

test("rejects non-HTTPS and malformed profile photo URLs", () => {
  assert.equal(resolveProfilePhotoUrl({ avatar_url: "javascript:alert(1)" }), null);
  assert.equal(resolveProfilePhotoUrl({ avatar_url: "http://example.com/a.png" }), null);
  assert.equal(resolveProfilePhotoUrl({ avatar_url: "not-a-url" }), null);
});

test("returns null when no provider photo metadata is available", () => {
  assert.equal(resolveProfilePhotoUrl(null), null);
  assert.equal(resolveProfilePhotoUrl({}), null);
});
