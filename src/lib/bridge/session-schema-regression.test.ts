import assert from "node:assert/strict";
import test from "node:test";
import { resolveBridgeUserIdFromMappings } from "./identity-resolution";
import { readFileSync } from "node:fs";

test("workspace profile query does not require organization tables or organization_id", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const profileQuery = source.match(/const rows = await sql<BridgeProfileRow>`([\s\S]*?)`;/)?.[1];
  assert.ok(profileQuery, "base profile query should exist");
  assert.match(profileQuery, /from bridge_profiles bp/);
  assert.doesNotMatch(profileQuery, /bridge_organization_memberships|bridge_organizations|bp\.organization_id/);
});

test("Studio and Buyer organization lookup is optional and fails closed when schema is missing", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  assert.match(source, /!\["studio", "buyer"\]\.includes\(actor\.accountType\) \|\| !actor\.emailVerified/);
  assert.match(source, /join bridge_organization_memberships m[\s\S]*m\.user_id = bp\.user_id[\s\S]*m\.organization_id = bp\.organization_id[\s\S]*m\.status = 'active'/);
  assert.match(source, /join bridge_organizations o[\s\S]*o\.status = 'active'/);
  assert.match(source, /catch \(error\) \{\s*if \(!isMissingOrganizationSchemaError\(error\)\) throw error/);
  assert.match(source, /actor\.organizationId = null/);
  assert.match(source, /workspaceFailureCode/);
  assert.doesNotMatch(source, /organization_name.*(?:fallback|organization_id)/i);
});

test("Buyer organization authority is derived from membership, not organization display name", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const lookup = source.slice(source.indexOf("const memberships ="), source.indexOf("} catch (error)", source.indexOf("const memberships =")));
  assert.match(lookup, /select m\.organization_id::text as organization_id/);
  assert.match(lookup, /m\.status = 'active'/);
  assert.match(lookup, /o\.status = 'active'/);
  assert.doesNotMatch(lookup, /organization_name/);
});

test("identity resolver accepts only an exact direct profile mapping", () => {
  assert.equal(resolveBridgeUserIdFromMappings("auth-1", ["auth-1"], []), "auth-1");
});

test("identity resolver accepts one explicit identity-link mapping", () => {
  assert.equal(resolveBridgeUserIdFromMappings("auth-1", [], ["bridge-1"]), "bridge-1");
});

test("identity resolver denies unresolved identity instead of returning the auth subject", () => {
  assert.throws(
    () => resolveBridgeUserIdFromMappings("auth-1", [], []),
    /BRIDGE_IDENTITY_UNRESOLVED/,
  );
});

test("identity resolver denies duplicate, conflicting, and mismatched mappings", () => {
  assert.throws(() => resolveBridgeUserIdFromMappings("auth-1", ["auth-1", "auth-1"], []), /BRIDGE_IDENTITY_AMBIGUOUS/);
  assert.throws(() => resolveBridgeUserIdFromMappings("auth-1", ["auth-1"], ["bridge-other"]), /BRIDGE_IDENTITY_CONFLICT/);
  assert.throws(() => resolveBridgeUserIdFromMappings("auth-1", ["other"], []), /BRIDGE_IDENTITY_MISMATCH/);
});