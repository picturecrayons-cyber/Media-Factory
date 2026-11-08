import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { authConfigResponse } from "./auth-config-response.ts";

test("auth config response is unavailable when no canonical Supabase URL is configured", async () => {
  const response = authConfigResponse(undefined);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: "unavailable",
    authority: "supabase",
    authUrl: null,
  });
});

test("auth config response uses the environment-resolved Preview URL without Production fallback", async () => {
  const previewUrl = "https://jbymleftneggcgutlcqu.supabase.co";
  const response = authConfigResponse(previewUrl);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "active",
    authority: "supabase",
    authUrl: previewUrl,
  });
});

test("auth API route resolves the URL from canonical runtime configuration only", () => {
  const source = readFileSync(new URL("../../routes/api/auth/$.ts", import.meta.url), "utf8");
  assert.ok(source.includes("bridgeEnv.supabaseUrl()"));
  assert.ok(source.includes("authConfigResponse"));
  assert.doesNotMatch(source, /mlmgugivsyoxzdgwkbpu/);
});
