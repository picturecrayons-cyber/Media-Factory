import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requiresServerAuth } from "./protected-path.ts";

describe("requiresServerAuth", () => {
  it("protects Bridge workspace routes and nested title routes", () => {
    for (const path of ["/creator", "/studio", "/buyer", "/investor", "/dashboard", "/workspace", "/title/123", "/deliveries", "/onboarding"]) {
      assert.equal(requiresServerAuth(path), true, path);
    }
  });

  it("does not gate public auth and marketing routes", () => {
    for (const path of ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback", "/verify-email", "/privacy"]) {
      assert.equal(requiresServerAuth(path), false, path);
    }
  });

  it("normalizes trailing slashes and avoids prefix collisions", () => {
    assert.equal(requiresServerAuth("/buyer/"), true);
    assert.equal(requiresServerAuth("/buyers"), false);
  });
});
