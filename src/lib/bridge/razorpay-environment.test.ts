import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertRazorpayRuntimeIsolation } from "./razorpay-environment.ts";

const testingUrl = "https://jbymleftneggcgutlcqu.supabase.co";

describe("Razorpay runtime isolation", () => {
  it("allows Preview only with Test Mode key and the approved Testing Supabase project", () => {
    assert.doesNotThrow(() => assertRazorpayRuntimeIsolation({
      vercelEnv: "preview",
      keyId: "rzp_test_example",
      supabaseUrl: testingUrl,
    }));
  });

  it("rejects a Live Razorpay key in Preview", () => {
    assert.throws(() => assertRazorpayRuntimeIsolation({
      vercelEnv: "preview",
      keyId: "rzp_live_example",
      supabaseUrl: testingUrl,
    }), /Test Mode/);
  });

  it("rejects missing Preview credentials", () => {
    assert.throws(() => assertRazorpayRuntimeIsolation({
      vercelEnv: "preview",
      supabaseUrl: testingUrl,
    }), /Test Mode/);
  });

  it("rejects a Production or unapproved Supabase project in Preview", () => {
    assert.throws(() => assertRazorpayRuntimeIsolation({
      vercelEnv: "preview",
      keyId: "rzp_test_example",
      supabaseUrl: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
    }), /unapproved Supabase project/);
  });

  it("rejects non-HTTPS Preview Supabase URLs", () => {
    assert.throws(() => assertRazorpayRuntimeIsolation({
      vercelEnv: "preview",
      keyId: "rzp_test_example",
      supabaseUrl: "http://jbymleftneggcgutlcqu.supabase.co",
    }), /unapproved Supabase project/);
  });

  it("allows the explicitly identified Production runtime", () => {
    assert.doesNotThrow(() => assertRazorpayRuntimeIsolation({
      vercelEnv: "production",
      keyId: "rzp_live_example",
      supabaseUrl: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
    }));
  });

  it("fails closed for missing, development, and unknown runtime markers", () => {
    for (const vercelEnv of [undefined, "development", "custom", "staging"]) {
      assert.throws(() => assertRazorpayRuntimeIsolation({
        vercelEnv,
        keyId: "rzp_test_example",
        supabaseUrl: testingUrl,
      }), /unknown or non-production runtime/);
    }
  });
});
