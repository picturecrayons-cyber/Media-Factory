import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSafeInternalRedirect } from "./return-to.ts";

describe("getSafeInternalRedirect", () => {
  it("preserves internal paths, query strings, and fragments", () => {
    assert.equal(getSafeInternalRedirect("/workspace?tab=titles#recent"), "/workspace?tab=titles#recent");
  });

  it("rejects external and protocol-relative URLs", () => {
    assert.equal(getSafeInternalRedirect("https://attacker.example/"), null);
    assert.equal(getSafeInternalRedirect("//attacker.example/"), null);
  });

  it("rejects backslash-based authority confusion", () => {
    assert.equal(getSafeInternalRedirect("/\\\\attacker.example/"), null);
    assert.equal(getSafeInternalRedirect("/\\attacker.example/"), null);
  });

  it("rejects empty and non-path values", () => {
    assert.equal(getSafeInternalRedirect(null), null);
    assert.equal(getSafeInternalRedirect(""), null);
    assert.equal(getSafeInternalRedirect("workspace"), null);
  });
});
