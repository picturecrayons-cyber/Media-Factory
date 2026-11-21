import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./story-concept-api.ts", import.meta.url), "utf8");

test("Story Concept reads are account-type scoped and require active Studio membership", () => {
  const creatorScopes = source.match(/actor\.accountType\} = 'independent_creator'[\s\S]*?t\.owner_account_type = 'independent_creator'[\s\S]*?t\.owner_user_id = \$\{actor\.userId\}/g) ?? [];
  const studioScopes = source.match(/actor\.accountType\} = 'studio'[\s\S]*?t\.owner_account_type = 'studio'[\s\S]*?bridge_organization_memberships m[\s\S]*?m\.status = 'active'/g) ?? [];
  assert.equal(creatorScopes.length >= 2, true, "both concept detail and list must scope Creator ownership");
  assert.equal(studioScopes.length >= 2, true, "both concept detail and list must require active Studio membership");
  assert.doesNotMatch(source, /t\.owner_user_id = \$\{actor\.userId\}\s+or/);
});
