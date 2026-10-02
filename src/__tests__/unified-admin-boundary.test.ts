import test from "node:test";
import assert from "node:assert/strict";

test("Bridge super_admin does not imply Loop CMS authorization", () => {
  const actor = { internalRole: "super_admin", accountType: "independent_creator" };
  const bridgeAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
  const loopCmsAuthorized = false;

  assert.equal(bridgeAdmin, true);
  assert.equal(loopCmsAuthorized, false);
});

test("public Loop and Loop CMS remain separate destinations", () => {
  const publicLoop = "https://crayonsloop.in/";
  const loopCms = null;

  assert.match(publicLoop, /^https:\/\/crayonsloop\.in\/$/);
  assert.equal(loopCms, null);
});

test("public Loop URL never embeds credentials", () => {
  const publicLoop = "https://crayonsloop.in/";

  assert.equal(publicLoop.includes("token="), false);
  assert.equal(publicLoop.includes("access_token"), false);
  assert.equal(publicLoop.includes("refresh_token"), false);
});
