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

  it("does not impose Preview-only restrictions on non-Preview runtimes", () => {
    assert.doesNotThrow(() => assertRazorpayRuntimeIsolation({
      vercelEnv: "production",
      keyId: "rzp_live_example",
      supabaseUrl: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
    }));
  });
});
