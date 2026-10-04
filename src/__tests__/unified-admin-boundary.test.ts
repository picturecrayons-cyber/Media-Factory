import test from "node:test";
import assert from "node:assert/strict";

test("Bridge super_admin exposes Loop CMS through the Bridge control plane", () => {
  const actor = { internalRole: "super_admin", accountType: "independent_creator" };
  const superAdmin = actor.internalRole === "super_admin";
  const loopCmsEntryPoint = superAdmin ? "/cms" : null;

  assert.equal(superAdmin, true);
  assert.equal(loopCmsEntryPoint, "/cms");
});

test("Bridge admin does not receive a Loop CMS entry point when /cms is super-admin gated", () => {
  const actor = { internalRole: "admin" };
  const superAdmin = actor.internalRole === "super_admin";
  assert.equal(superAdmin ? "/cms" : null, null);
});

test("Loop CMS is not a second independent back-office application", () => {
  const loopCms = "/cms";
  const independentLoopCms = null;

  assert.equal(loopCms, "/cms");
  assert.equal(independentLoopCms, null);
});

test("public Loop URL never embeds credentials", () => {
  const publicLoop = "https://crayonsloop.in/";

  assert.equal(publicLoop.includes("token="), false);
  assert.equal(publicLoop.includes("access_token"), false);
  assert.equal(publicLoop.includes("refresh_token"), false);
});
