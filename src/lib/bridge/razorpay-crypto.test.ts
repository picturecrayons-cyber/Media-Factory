import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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
