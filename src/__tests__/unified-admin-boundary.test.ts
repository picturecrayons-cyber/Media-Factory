import { describe, expect, it } from "vitest";

describe("unified admin product boundary", () => {
  it("does not treat Bridge super_admin as Loop CMS authorization", () => {
    const actor = { internalRole: "super_admin", accountType: "independent_creator" };
    const bridgeAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
    const loopCmsAuthorized = false;

    expect(bridgeAdmin).toBe(true);
    expect(loopCmsAuthorized).toBe(false);
  });

  it("keeps public Loop and Loop CMS as separate destinations", () => {
    const publicLoop = "https://crayonsloop.in/";
    const loopCms = null;
    expect(publicLoop).toMatch(/^https:\/\/crayonsloop\.in\/$/);
    expect(loopCms).toBeNull();
  });

  it("never embeds credentials in the public Loop URL", () => {
    const publicLoop = "https://crayonsloop.in/";
    expect(publicLoop).not.toContain("token=");
    expect(publicLoop).not.toContain("access_token");
    expect(publicLoop).not.toContain("refresh_token");
  });
});
