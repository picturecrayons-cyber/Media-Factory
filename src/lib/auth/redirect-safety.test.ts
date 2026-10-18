import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeBridgeNextPath } from "./redirect-safety.ts";

const origin = "https://bridge-preview.vercel.app";

test("accepts approved internal workspace paths and preserves query/hash", () => {
  assert.equal(sanitizeBridgeNextPath("/title/legacy-film-7?tab=assets#poster", origin), "/title/legacy-film-7?tab=assets#poster");
  assert.equal(sanitizeBridgeNextPath("/workspace", origin), "/workspace");
});

test("rejects protocol-relative, external, backslash and control-character redirects", () => {
  for (const candidate of [
    "//evil.example/path",
    "/\\\\evil.example/path",
    "https://evil.example/path",
    "/dashboard\\\\@evil.example",
    "/dashboard\u0000",
  ]) assert.equal(sanitizeBridgeNextPath(candidate, origin), null, candidate);
});

test("rejects unrelated and prefix-confusion internal routes", () => {
  assert.equal(sanitizeBridgeNextPath("/login", origin), null);
  assert.equal(sanitizeBridgeNextPath("/auth/callback?next=/dashboard", origin), null);
  assert.equal(sanitizeBridgeNextPath("/dashboard.evil", origin), null);
});

test("requires an origin and fails closed for malformed inputs", () => {
  assert.equal(sanitizeBridgeNextPath(null, origin), null);
  assert.equal(sanitizeBridgeNextPath("/dashboard", "not a url"), null);
});
