import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertRazorpayEnvironment,
  paymentVerifyBody,
  razorpaySignature,
  verifyRazorpaySignature,
} from "./razorpay-crypto.ts";

describe("razorpay signatures", () => {
  it("accepts a matching HMAC and rejects a flipped bit", () => {
    const secret = "whsec_test";
    const body = paymentVerifyBody("order_1", "pay_1");
    const sig = razorpaySignature(secret, body);
    assert.equal(verifyRazorpaySignature({ secret, body, signature: sig }), true);
    const flipped = `${sig.slice(0, -1)}${sig.endsWith("a") ? "b" : "a"}`;
    assert.equal(verifyRazorpaySignature({ secret, body, signature: flipped }), false);
    assert.equal(verifyRazorpaySignature({ secret, body, signature: null }), false);
  });
});


describe("razorpay deployment mode guard", () => {
  it("blocks Preview when the explicit test-mode flag is missing or false", () => {
    assert.throws(() => assertRazorpayEnvironment({ deploymentEnvironment: "preview", testMode: undefined, keyId: "rzp_test_123" }), /RAZORPAY_TEST_MODE must be true/);
    assert.throws(() => assertRazorpayEnvironment({ deploymentEnvironment: "preview", testMode: "false", keyId: "rzp_test_123" }), /RAZORPAY_TEST_MODE must be true/);
  });
  it("blocks live-format key IDs in Preview even when the flag is true", () => {
    assert.throws(() => assertRazorpayEnvironment({ deploymentEnvironment: "preview", testMode: "true", keyId: "rzp_live_123" }), /Test Mode key ID is required/);
  });
  it("allows an explicit Test Mode key in Preview", () => {
    assert.doesNotThrow(() => assertRazorpayEnvironment({ deploymentEnvironment: "preview", testMode: "true", keyId: "rzp_test_123" }));
  });
  it("does not alter Production mode selection", () => {
    assert.doesNotThrow(() => assertRazorpayEnvironment({ deploymentEnvironment: "production", testMode: undefined, keyId: "rzp_live_123" }));
  });
});
