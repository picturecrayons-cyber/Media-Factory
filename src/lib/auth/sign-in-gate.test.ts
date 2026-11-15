import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSignInGateState, resolvePostLoginDestination } from "./sign-in-gate.ts";

describe("resolveSignInGateState", () => {
  it("is pending while the session check is in flight, user or not", () => {
    assert.equal(resolveSignInGateState({ isPending: true, hasUser: false }), "pending");
    assert.equal(resolveSignInGateState({ isPending: true, hasUser: true }), "pending");
  });

  it("is signed_in once a user is present", () => {
    assert.equal(resolveSignInGateState({ isPending: false, hasUser: true }), "signed_in");
  });

  it("is signed_out only after the check resolved with no user", () => {
    assert.equal(resolveSignInGateState({ isPending: false, hasUser: false }), "signed_out");
  });
});

describe("resolvePostLoginDestination", () => {
  it("routes Creator accounts to the Creator workspace from the server-resolved profile", () => {
    assert.equal(resolvePostLoginDestination({ sessionHome: "/creator" }), "/creator");
  });

  it("routes Studio accounts to the Studio workspace from the server-resolved profile", () => {
    assert.equal(resolvePostLoginDestination({ sessionHome: "/studio" }), "/studio");
  });

  it("routes Buyer accounts to the Buyer workspace from the server-resolved profile", () => {
    assert.equal(resolvePostLoginDestination({ sessionHome: "/buyer" }), "/buyer");
  });

  it("routes the verified Super Admin to the private control dashboard", () => {
    assert.equal(resolvePostLoginDestination({ sessionHome: "/dashboard" }), "/dashboard");
  });

  it("falls back to onboarding only when the server reports no mapped profile", () => {
    assert.equal(resolvePostLoginDestination({ sessionHome: null }), "/onboarding");
    assert.equal(resolvePostLoginDestination({ sessionHome: undefined }), "/onboarding");
  });
});
