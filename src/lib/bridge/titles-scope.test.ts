import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Studio title list scope does not expand access by display organization name", () => {
  const source = readFileSync(new URL("./titles.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function listOwned(");
  const end = source.indexOf("\nfunction slugify(", start);
  assert.notEqual(start, -1, "listOwned query helper must exist");
  assert.notEqual(end, -1, "listOwned query helper must have a bounded definition");
  const helper = source.slice(start, end);
  assert.match(helper, /where owner_user_id = \$\{userId\}/);
  assert.doesNotMatch(helper, /organization_name|bridge_profiles/);
});
