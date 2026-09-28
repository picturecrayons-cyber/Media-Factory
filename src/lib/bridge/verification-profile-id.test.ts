import assert from "node:assert/strict";
import { test } from "node:test";
import { verificationProfileId } from "./verification-profile-id.ts";
import type { BridgeActor } from "./session.ts";

const linkedActor = { userId: "legacy-bridge-profile" } as BridgeActor;

test("verification uses the mapped Bridge identity instead of the auth UUID", () => {
  const authUserId = "c1817412-039c-43af-9e11-2381b6ceb27c";
  assert.notEqual(verificationProfileId(linkedActor), authUserId);
  assert.equal(verificationProfileId(linkedActor), "legacy-bridge-profile");
});

test("verification requires an existing Bridge profile", () => {
  assert.throws(() => verificationProfileId(null), /Bridge profile required/);
});
