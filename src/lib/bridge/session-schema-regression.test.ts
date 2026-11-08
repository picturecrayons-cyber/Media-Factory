import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("workspace profile query does not require organization tables or organization_id", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const profileQuery = source.match(/const rows = await sql<BridgeProfileRow>`([\s\S]*?)`;/)?.[1];
  assert.ok(profileQuery, "base profile query should exist");
  assert.match(profileQuery, /from bridge_profiles bp/);
  assert.doesNotMatch(profileQuery, /bridge_organization_memberships|bridge_organizations|bp\.organization_id/);
});

test("studio organization lookup is optional and fails closed when schema is missing", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  assert.match(source, /if \(actor\.accountType !== "studio" \|\| !actor\.emailVerified\) return actor/);
  assert.match(source, /catch \(error\) \{\s*if \(!isMissingOrganizationSchemaError\(error\)\) throw error/);
  assert.match(source, /actor\.organizationId = null/);
  assert.match(source, /workspaceFailureCode/);
  assert.doesNotMatch(source, /organization_name.*(?:fallback|organization_id)/i);
});

test("identity resolver requires direct immutable auth subject and rejects legacy/email inference", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function resolveBridgeUserId");
  const end = source.indexOf("export async function loadActor", start);
  const resolver = source.slice(start, end);
  assert.ok(resolver.includes("requireDirectBridgeIdentity"));
  assert.equal(resolver.includes("bridge_loop_identity_links"), false);
  assert.equal(resolver.includes("auth.users"), false);
  assert.equal(resolver.toLowerCase().includes("email"), false);
});
