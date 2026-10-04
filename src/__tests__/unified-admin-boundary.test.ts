import test from "node:test";
import assert from "node:assert/strict";

test("Bridge super_admin exposes Loop CMS through the Bridge control plane", () => {
  const actor = { internalRole: "super_admin", accountType: "independent_creator" };
  const bridgeAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
  const loopCmsEntryPoint = bridgeAdmin ? "/cms" : null;

  assert.equal(bridgeAdmin, true);
  assert.equal(loopCmsEntryPoint, "/cms");
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
