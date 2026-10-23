import assert from "node:assert/strict";
import test from "node:test";
import { resolveExplicitBridgeProfileId } from "./identity-link-guard.ts";

const authUserId = "f4bfb59d-2a9a-43e2-a84a-4e2f1cc7e60b";

test("existing account keeps its direct Bridge profile ID", () => {
  assert.equal(resolveExplicitBridgeProfileId({ authUserId, directProfileId: authUserId }), authUserId);
});

test("explicitly linked OAuth identity resolves to the original Bridge profile ID", () => {
  assert.equal(resolveExplicitBridgeProfileId({
    authUserId,
    linkedProfileId: "legacy-bridge-profile-42",
  }), "legacy-bridge-profile-42");
});

test("email-only duplicate is not treated as an identity link", () => {
  assert.equal(resolveExplicitBridgeProfileId({
    authUserId,
    directProfileId: null,
    linkedProfileId: null,
  }), null);
});

test("unlinked account remains eligible for onboarding without adopting another profile ID", () => {
  assert.equal(resolveExplicitBridgeProfileId({ authUserId }), null);
});

test("a different direct profile ID is not accepted as the caller's identity", () => {
  assert.equal(resolveExplicitBridgeProfileId({
    authUserId,
    directProfileId: "some-other-profile",
  }), null);
});
