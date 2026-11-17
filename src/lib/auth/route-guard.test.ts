import test from "node:test";
import assert from "node:assert/strict";
import { resolveProtectedBridgeRoute, type BridgeRouteAccess, type ProtectedBridgeProfile } from "./route-guard.ts";

type Profile = ProtectedBridgeProfile & {
};

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  userId: "bridge-user",
  email: "person@example.com",
  displayName: "Person",
  organizationName: null,
  accountType: "independent_creator",
  internalRole: null,
  emailVerified: true,
  ...overrides,
});

function dependencies(value: Profile | null, opts: { browser?: boolean; fail?: boolean } = {}) {
  const redirects: string[] = [];
  const deps = {
    isBrowser: opts.browser ?? true,
    getSession: async () => {
      if (opts.fail) throw new Error("session unavailable");
      return { userId: "auth-user", profile: value, home: "/creator" } as never;
    },
    goToLogin: () => { redirects.push("login"); throw new Error("redirect:login"); },
    goToOnboarding: () => { redirects.push("onboarding"); throw new Error("redirect:onboarding"); },
    goToWorkspace: () => { redirects.push("workspace"); throw new Error("redirect:workspace"); },
  };
  return { deps, redirects };
}

test("SSR defers browser-token route checks; server functions remain authoritative", async () => {
  const { deps } = dependencies(profile(), { browser: false });
  const result = await resolveProtectedBridgeRoute(deps);
  assert.equal(result, undefined);
});

test("session lookup failures redirect to sign-in", async () => {
  const { deps, redirects } = dependencies(profile(), { fail: true });
  await assert.rejects(() => resolveProtectedBridgeRoute(deps), /redirect:login/);
  assert.deepEqual(redirects, ["login"]);
});

test("an authenticated identity without a Bridge profile goes to onboarding", async () => {
  const { deps, redirects } = dependencies(null);
  await assert.rejects(() => resolveProtectedBridgeRoute(deps), /redirect:onboarding/);
  assert.deepEqual(redirects, ["onboarding"]);
});

test("buyer route admits Buyers and verified Super Admins only", async () => {
  for (const value of [
    profile({ accountType: "buyer" }),
    profile({ internalRole: "super_admin", emailVerified: true }),
  ]) {
    const { deps } = dependencies(value);
    assert.ok(await resolveProtectedBridgeRoute(deps, "buyer"));
  }
  for (const value of [
    profile({ accountType: "buyer", internalRole: null, emailVerified: false }),
    profile({ internalRole: "super_admin", emailVerified: false }),
    profile({ internalRole: "admin" }),
    profile({ internalRole: "qc_reviewer" }),
    profile({ accountType: "independent_creator" }),
    profile({ accountType: "studio" }),
    profile({ accountType: "investor" }),
  ]) {
    const { deps, redirects } = dependencies(value);
    await assert.rejects(() => resolveProtectedBridgeRoute(deps, "buyer"), /redirect:workspace/);
    assert.deepEqual(redirects, ["workspace"]);
  }
});

test("internal and Super Admin gates remain role- and verification-specific", async () => {
  const checks: Array<[Profile, BridgeRouteAccess, boolean]> = [
    [profile({ internalRole: "admin" }), "internal", true],
    [profile({ internalRole: "qc_reviewer" }), "internal", true],
    [profile({ internalRole: null }), "internal", false],
    [profile({ internalRole: "super_admin" }), "super_admin", true],
    [profile({ internalRole: "super_admin", emailVerified: false }), "super_admin", false],
    [profile({ internalRole: "admin" }), "super_admin", false],
  ];
  for (const [value, access, allowed] of checks) {
    const { deps } = dependencies(value);
    if (allowed) assert.ok(await resolveProtectedBridgeRoute(deps, access));
    else await assert.rejects(() => resolveProtectedBridgeRoute(deps, access), /redirect:workspace/);
  }
});

test("creator, studio and investor routes stay account-type scoped", async () => {
  const cases: Array<[Profile, BridgeRouteAccess, boolean]> = [
    [profile({ accountType: "independent_creator" }), "creator", true],
    [profile({ accountType: "studio" }), "studio", true],
    [profile({ accountType: "investor" }), "investor", true],
    [profile({ accountType: "buyer" }), "creator", false],
    [profile({ accountType: "studio", internalRole: "admin" }), "studio", false],
  ];
  for (const [value, access, allowed] of cases) {
    const { deps } = dependencies(value);
    if (allowed) assert.ok(await resolveProtectedBridgeRoute(deps, access));
    else await assert.rejects(() => resolveProtectedBridgeRoute(deps, access), /redirect:workspace/);
  }
});

test("title workspace requires verified identity and creator/studio or internal staff profile", async () => {
  for (const value of [
    profile({ accountType: "independent_creator" }),
    profile({ accountType: "studio" }),
    profile({ internalRole: "qc_reviewer" }),
    profile({ internalRole: "super_admin" }),
  ]) {
    const { deps } = dependencies(value);
    assert.ok(await resolveProtectedBridgeRoute(deps, "workspace"));
  }
  for (const value of [
    profile({ accountType: "buyer" }),
    profile({ accountType: "investor" }),
    profile({ accountType: "independent_creator", emailVerified: false }),
  ]) {
    const { deps } = dependencies(value);
    await assert.rejects(() => resolveProtectedBridgeRoute(deps, "workspace"), /redirect:workspace/);
  }
});
