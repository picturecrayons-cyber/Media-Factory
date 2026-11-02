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

test("identity resolver requires an explicit verified identity link and rejects email inference", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const resolver = source.match(/export async function resolveBridgeUserId[\s\S]*?\n}\n\nexport async function loadActor/)?.[0] ?? "";
  assert.ok(resolver, "identity resolver should exist");
  assert.match(resolver, /bridge_loop_identity_links/);
  assert.match(resolver, /verified_at is not null/);
  assert.match(resolver, /verified_by/);
  assert.match(resolver, /BRIDGE_IDENTITY_UNRESOLVED/);
  assert.doesNotMatch(resolver, /auth\.users|lower\(au\.email\)|email_confirmed_at/);
});
