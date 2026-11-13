import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSignInGateState } from "./sign-in-gate.ts";

describe("resolveSignInGateState", () => {
  it("is pending while the session check is in flight, user or not", () => {
    assert.equal(
      resolveSignInGateState({ isPending: true, hasUser: false }),
      "pending",
    );
    assert.equal(
      resolveSignInGateState({ isPending: true, hasUser: true }),
      "pending",
    );
  });

  it("is signed_in once a user is present", () => {
    assert.equal(
      resolveSignInGateState({ isPending: false, hasUser: true }),
      "signed_in",
    );
  });

  it("is signed_out only after the check resolved with no user", () => {
    assert.equal(
      resolveSignInGateState({ isPending: false, hasUser: false }),
      "signed_out",
    );
  });
});


describe("resolvePostLoginDestination", () => {
  it("routes a server-resolved independent creator to the Creator workspace", async () => {
    const { resolvePostLoginDestination } = await import("./sign-in-gate.ts");
    assert.equal(resolvePostLoginDestination({ next: null, sessionHome: "/creator" }), "/creator");
  });

  it("routes a server-resolved studio to the Studio workspace", async () => {
    const { resolvePostLoginDestination } = await import("./sign-in-gate.ts");
    assert.equal(resolvePostLoginDestination({ next: null, sessionHome: "/studio" }), "/studio");
  });

  it("uses onboarding rather than the super-admin dashboard when session resolution fails", async () => {
    const { resolvePostLoginDestination } = await import("./sign-in-gate.ts");
    assert.equal(resolvePostLoginDestination({ next: null, sessionHome: null }), "/onboarding");
    assert.equal(resolvePostLoginDestination({ next: null, sessionHome: undefined }), "/onboarding");
  });

  it("rejects external and protocol-relative next destinations", async () => {
    const { resolvePostLoginDestination } = await import("./sign-in-gate.ts");
    assert.equal(resolvePostLoginDestination({ next: "https://evil.example", sessionHome: "/creator" }), "/creator");
    assert.equal(resolvePostLoginDestination({ next: "//evil.example", sessionHome: "/creator" }), "/creator");
  });

  it("preserves a safe internal next destination", async () => {
    const { resolvePostLoginDestination } = await import("./sign-in-gate.ts");
    assert.equal(resolvePostLoginDestination({ next: "/account", sessionHome: "/creator" }), "/account");
  });
});
