import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifySignupResult } from "./signup-classification.ts";

describe("classifySignupResult", () => {
  it("routes auto-confirmed signups to session", () => {
    assert.equal(classifySignupResult({ session: { access_token: "x" }, user: null }), "session");
  });

  it("treats an empty identities array as an existing obscured account", () => {
    assert.equal(classifySignupResult({ session: null, user: { identities: [] } }), "existing");
  });

  it("keeps genuine unverified signups on confirmation flow", () => {
    assert.equal(classifySignupResult({ session: null, user: { identities: [{ id: "new" }] } }), "confirm");
  });
});
