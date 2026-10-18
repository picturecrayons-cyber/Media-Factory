import test from "node:test";
import assert from "node:assert/strict";
import { isSafeInternalRedirect } from "./redirect-safety.ts";

test("accepts ordinary internal routes and their query/hash components", () => {
  for (const path of ["/dashboard", "/workspace/titles", "/account?tab=security", "/title/abc#rights"]) {
    assert.equal(isSafeInternalRedirect(path), true, path);
  }
});

test("rejects external, protocol-relative, and backslash redirect attempts", () => {
  for (const path of [
    "https://attacker.example",
    "//attacker.example",
    "/\\\\attacker.example",
    "/\\attacker.example",
    "javascript:alert(1)",
    "dashboard",
    "",
    null,
    undefined,
  ]) {
    assert.equal(isSafeInternalRedirect(path), false, String(path));
  }
});
