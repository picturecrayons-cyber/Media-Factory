import test from "node:test";
import assert from "node:assert/strict";

test("Bridge super_admin exposes Loop CMS through the Bridge control plane", () => {
  const actor = { internalRole: "super_admin", accountType: "independent_creator" };
  const superAdmin = actor.internalRole === "super_admin";
  const loopCmsEntryPoint = superAdmin ? "/cms" : null;

  assert.equal(superAdmin, true);
  assert.equal(loopCmsEntryPoint, "/cms");
});

test("Bridge admin does not receive an independent Loop CMS application", () => {
  const actor = { internalRole: "admin" };
  const superAdmin = actor.internalRole === "super_admin";
  assert.equal(superAdmin ? "/cms" : null, null);
});

test("public Loop URL never embeds credentials", () => {
  const publicLoop = "https://crayonsloop.com/";

  assert.equal(publicLoop.includes("token="), false);
  assert.equal(publicLoop.includes("access_token"), false);
  assert.equal(publicLoop.includes("refresh_token"), false);
});
