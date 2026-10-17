import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("admin profile API fails closed unless actor is a verified admin or super admin", () => {
  const src = read("./profiles.ts");
  const start = src.indexOf("export const listAdminProfiles");
  assert.notEqual(start, -1, "admin profile server function must exist");
  const end = src.indexOf("export const inviteInternalRole", start);
  const handler = src.slice(start, end === -1 ? undefined : end);
  assert.match(handler, /\.middleware\(\[authMiddleware\]\)/);
  assert.match(handler, /requireVerifiedActor\(context\.userId\)/);
  assert.match(handler, /actor\.internalRole !== "admin" && actor\.internalRole !== "super_admin"/);
  assert.match(handler, /throw new Error\("Admin access required"\)/);
});

test("reviewer workspace does not return all Bridge profiles or user emails", () => {
  const src = read("./admin-workstations.ts");
  assert.doesNotMatch(src, /from bridge_profiles/i);
  assert.doesNotMatch(src, /\bprofiles\b/);
});

test("the Users & Organizations view distinguishes query errors from successful empty results", () => {
  const src = read("../../routes/admin.tsx");
  assert.match(src, /profilesQ\.isError/);
  assert.match(src, /data-fetch error, not an empty result/);
  assert.match(src, /profilesQ\.refetch\(\)/);
  assert.match(src, /!profilesQ\.isPending && !profilesQ\.isError/);
});
