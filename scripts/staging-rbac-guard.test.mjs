import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./staging-rbac-smoke.mjs", import.meta.url), "utf8");

test("staging RBAC smoke guard is pinned to the approved Testing DB", () => {
  assert.match(source, /const REQUIRED_PROJECT_REF = "jbymleftneggcgutlcqu"/);
  assert.doesNotMatch(source, /bbtrosuwisnxacuxvegt/);
  assert.match(source, /BRIDGE_STAGING_PROJECT_REF must equal/);
  assert.match(source, /database host\/user does not prove the exact staging project/);
});

test("required schema preflight happens before fixture transaction begins", () => {
  const preflight = source.indexOf("const requiredTables = await client.query");
  const begin = source.indexOf('await client.query("BEGIN")');
  const seed = source.indexOf("seedStagingRbacFixtures(client)");
  assert.ok(preflight >= 0, "read-only required-table preflight must exist");
  assert.ok(begin > preflight, "transaction must begin only after preflight");
  assert.ok(seed > begin, "synthetic fixture writes must occur only after preflight");
  assert.match(source, /No transaction or fixture writes were started/);
});
