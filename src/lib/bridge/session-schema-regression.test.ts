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


test("Studio session resolves every active membership and treats profile organization_id as selection only", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  assert.match(source, /select m\.organization_id::text as organization_id/);
  assert.match(source, /where m\.user_id = \$\{userId\}/);
  assert.match(source, /actor\.organizationIds = memberships\.map/);
  assert.match(source, /actor\.organizationMemberships = memberships\.map/);
  assert.match(source, /preferredOrganizationId/);
  assert.doesNotMatch(source, /m\.organization_id = bp\.organization_id/);
});
