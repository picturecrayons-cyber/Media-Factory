import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BRIDGE_CANONICAL_ORIGIN,
  bridgeCallbackUrl,
  bridgeInvitationUrl,
  bridgeVerificationUrl,
  isApprovedBridgeOrigin,
  isRetiredBridgeOrigin,
  resolveBridgeCanonicalOrigin,
  resolveBridgeConfiguredOrigin,
} from "./origin.ts";

const PREVIEW = "https://bridge-cra118-stream-vista-opc-pvt-ltd-s-projects.vercel.app";

describe("Bridge canonical origin", () => {
  it("falls back to approved Production when configuration is missing", () => {
    assert.equal(resolveBridgeCanonicalOrigin(undefined), BRIDGE_CANONICAL_ORIGIN);
    assert.equal(resolveBridgeConfiguredOrigin(undefined, undefined), BRIDGE_CANONICAL_ORIGIN);
  });

  it("uses APP_URL before SITE_URL", () => {
    assert.equal(resolveBridgeConfiguredOrigin(PREVIEW, BRIDGE_CANONICAL_ORIGIN), PREVIEW);
    assert.equal(resolveBridgeConfiguredOrigin(undefined, PREVIEW), PREVIEW);
  });

  it("rejects retired, invalid and unapproved origins", () => {
    for (const origin of [
      "https://bridge.streamvista.in",
      "https://foo.streamvista.in",
      "https://preview.example.com",
      "javascript:alert(1)",
    ]) assert.equal(resolveBridgeCanonicalOrigin(origin), BRIDGE_CANONICAL_ORIGIN);
    assert.equal(isRetiredBridgeOrigin("https://bridge.streamvista.in"), true);
    assert.equal(isApprovedBridgeOrigin("https://preview.example.com"), false);
  });

  it("preserves approved Production and explicit Bridge Preview origins", () => {
    assert.equal(resolveBridgeCanonicalOrigin(BRIDGE_CANONICAL_ORIGIN), BRIDGE_CANONICAL_ORIGIN);
    assert.equal(resolveBridgeCanonicalOrigin(PREVIEW + "/dashboard"), PREVIEW);
  });

  it("builds verification and invitation URLs with dummy tokens", () => {
    assert.equal(bridgeVerificationUrl("dummy verify", PREVIEW), PREVIEW + "/verify-email?token=dummy%20verify");
    assert.equal(bridgeInvitationUrl("dummy invite", BRIDGE_CANONICAL_ORIGIN), BRIDGE_CANONICAL_ORIGIN + "/signup?invite=dummy%20invite");
  });

  it("builds signup and recovery callback URLs through the same resolver", () => {
    assert.equal(bridgeCallbackUrl(PREVIEW), PREVIEW + "/auth/callback");
    assert.equal(bridgeCallbackUrl(BRIDGE_CANONICAL_ORIGIN, "recovery"), BRIDGE_CANONICAL_ORIGIN + "/auth/callback?type=recovery");
    assert.equal(bridgeCallbackUrl("https://evil.example"), BRIDGE_CANONICAL_ORIGIN + "/auth/callback");
  });
});
