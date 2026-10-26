import test from "node:test";
import assert from "node:assert/strict";
import { isSafeInternalRedirect } from "./safe-redirect.ts";

test("accepts internal absolute paths and query strings", () => {
  assert.equal(isSafeInternalRedirect("/dashboard"), true);
  assert.equal(isSafeInternalRedirect("/workspace?tab=titles"), true);
});

test("rejects external, protocol-relative, and normalized-backslash destinations", () => {
  assert.equal(isSafeInternalRedirect("https://evil.example"), false);
  assert.equal(isSafeInternalRedirect("//evil.example/path"), false);
  assert.equal(isSafeInternalRedirect("/\\\\evil.example/path"), false);
});

test("rejects empty and control-character destinations", () => {
  assert.equal(isSafeInternalRedirect(null), false);
  assert.equal(isSafeInternalRedirect(""), false);
  assert.equal(isSafeInternalRedirect("/dashboard\nhttps://evil.example"), false);
});
