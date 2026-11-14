import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("server middleware verifies a Supabase bearer token before protected server functions run", () => {
  const middleware = read("./middleware.ts");
  const verifier = read("./verify.server.ts");
  assert.match(middleware, /\.server\(async \(\{ next, context \}\)/);
  assert.match(middleware, /assertSameSiteRequest\(\)/);
  assert.match(middleware, /requireUser\(context\.bearerToken\)/);
  assert.match(verifier, /\/auth\/v1\/user/);
  assert.match(verifier, /if \(!response\.ok\)/);
  assert.match(verifier, /export async function requireUser\(/);
});

test("Bridge workspace gate waits for authentication and redirects signed-out users", () => {
  const gate = read("../../components/bridge/gate.tsx");
  assert.match(gate, /if \(isPending \|\| \(user && sessionQ\.isPending\)\)/);
  assert.match(gate, /if \(!user\) return <RedirectToSignIn \/>/);
  assert.match(gate, /if \(!profile\) return <Navigate to="\/onboarding" \/>/);
});

test("Bridge role-specific workspaces reject mismatched account types and unverified email", () => {
  const gate = read("../../components/bridge/gate.tsx");
  assert.match(gate, /if \(allow === "super_admin" && profile\.internalRole !== "super_admin"\)/);
  assert.match(gate, /if \(allow === "internal" && !profile\.internalRole\)/);
  assert.match(gate, /profile\.accountType !==/);
  assert.match(gate, /if \(!profile\.emailVerified\)/);
});

test("admin data server function independently requires a verified super-admin", () => {
  const session = read("../bridge/session.ts");
  assert.match(session, /getDashboardSession = createServerFn/);
  assert.match(session, /\.middleware\(\[authMiddleware\]\)/);
  assert.match(session, /requireVerifiedActor\(context\.userId\)/);
  assert.match(session, /if \(!canAccessDashboard\(actor\)\) throw new Error\("Super admin access required"\)/);
});

test("public session lookup is also authenticated and rejects development identities", () => {
  const session = read("../bridge/session.ts");
  assert.match(session, /getBridgeSession = createServerFn/);
  assert.match(session, /\.middleware\(\[authMiddleware\]\)/);
  assert.match(session, /assertNotDevUser\(context\.userId\)/);
  assert.match(session, /if \(!actor\)/);
});
