import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("server auth verifies the bearer token with the canonical Supabase Auth user endpoint", () => {
  const verify = read("./verify.server.ts");
  assert.match(verify, /\/auth\/v1\/user/);
  assert.match(verify, /Authorization.*Bearer/);
  assert.match(verify, /if \(!supabaseUrl \|\| !supabasePublishableKey\) return null/);
  assert.match(verify, /response\.status === 401 \|\| response\.status === 403/);
  assert.doesNotMatch(verify, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("protected server functions enforce request isolation before identity verification", () => {
  const middleware = read("./middleware.ts");
  assert.match(middleware, /assertSameSiteRequest\(\)/);
  assert.match(middleware, /requireUser\(context\.bearerToken\)/);
  assert.ok(
    middleware.indexOf("assertSameSiteRequest()") < middleware.indexOf("requireUser(context.bearerToken)"),
    "request isolation must run before authentication-dependent work",
  );
});

test("browser route guards are not treated as the authorization boundary", () => {
  const guard = read("./route-guard.ts");
  assert.match(guard, /security boundary remains the authenticated server-function middleware/);
  assert.match(guard, /session\.profile\.internalRole/);
  assert.match(guard, /session\.profile\.accountType !== "buyer"/);
});
