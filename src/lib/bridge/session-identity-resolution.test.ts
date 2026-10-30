import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectBridgeUserId } from "./identity-resolution.ts";

const authUserId = "c1817412-039c-43af-9e11-2381b6ceb27c";
const legacyBridgeUserId = "legacy-bridge-profile";

test("uses an explicit identity link for a legacy Bridge profile", () => {
  assert.equal(selectBridgeUserId(authUserId, legacyBridgeUserId), legacyBridgeUserId);
});

test("returns the auth ID when no explicit identity link exists", () => {
  assert.equal(selectBridgeUserId(authUserId, null), authUserId);
});

test("resolves direct same-ID profiles before querying the optional link table", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const directReturn = source.indexOf("if (direct[0]?.user_id) return direct[0].user_id;");
  const linkQuery = source.indexOf("const linked =", directReturn);
  assert.ok(directReturn >= 0 && linkQuery > directReturn);
});

test("does not use email equality as an identity-binding fallback", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /join auth\.users\s+au on lower\(au\.email\) = lower\(bp\.email\)/);
  assert.doesNotMatch(source, /const byEmail =/);
});
