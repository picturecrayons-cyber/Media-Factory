import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectBridgeUserId } from "./identity-resolution.ts";

const authUserId = "c1817412-039c-43af-9e11-2381b6ceb27c";
const legacyBridgeUserId = "legacy-bridge-profile";

test("uses a direct same-ID Bridge profile when no separate link exists", () => {
  assert.equal(selectBridgeUserId(authUserId, authUserId, null), authUserId);
});

test("uses an explicit identity link for a legacy Bridge profile", () => {
  assert.equal(selectBridgeUserId(authUserId, null, legacyBridgeUserId), legacyBridgeUserId);
});

test("accepts matching direct and explicit identity bindings", () => {
  assert.equal(selectBridgeUserId(authUserId, authUserId, authUserId), authUserId);
});

test("fails closed when direct and explicit identity bindings conflict", () => {
  assert.throws(
    () => selectBridgeUserId(authUserId, authUserId, legacyBridgeUserId),
    /Conflicting Bridge identity bindings/,
  );
});

test("does not use email equality as an identity-binding fallback", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /join auth\.users\s+au on lower\(au\.email\) = lower\(bp\.email\)/);
  assert.doesNotMatch(source, /const byEmail =/);
});

test("returns the auth ID when no profile or explicit link exists; actor lookup must then fail closed", () => {
  assert.equal(selectBridgeUserId(authUserId, null, null), authUserId);
});
