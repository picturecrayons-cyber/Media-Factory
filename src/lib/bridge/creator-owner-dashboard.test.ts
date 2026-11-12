import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Creator Owner dashboard is Super Admin gated and uses a dedicated owner-only read model", () => {
  const route = read("../../routes/creator-owner.tsx");
  const titles = read("./titles.ts");
  const dashboard = read("../../routes/dashboard.tsx");
  assert.match(route, /<RequireBridge allow="super_admin">/);
  assert.match(route, /listCreatorOwnerTitles/);
  assert.match(titles, /actor\.internalRole !== "super_admin" \|\| actor\.accountType !== "independent_creator"/);
  assert.match(titles, /where owner_user_id = \$\{actor\.userId\}/);
  assert.doesNotMatch(titles.slice(titles.indexOf("export const listCreatorOwnerTitles")), /listCatalog\(/);
  assert.match(dashboard, /to: "\/creator-owner"/);
});

test("Creator Owner dashboard explicitly distinguishes producer credits from legal ownership", () => {
  const route = read("../../routes/creator-owner.tsx");
  assert.match(route, /Producer credit on title/);
  assert.match(route, /legal ownership and authority require separate verified documents/);
  assert.match(route, /does not grant\s*rights approval, legal approval, licensing, payment or publication authority/);
});
