import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Creator and Studio onboarding requires explicit mandate acceptance server-side", () => {
  const profiles = read("../src/lib/bridge/profiles.ts");
  assert.match(profiles, /creatorMandateAccepted:\s*z\.boolean\(\)\.optional\(\)/);
  assert.match(profiles, /isRightsHolder && data\.creatorMandateAccepted !== true/);
  assert.match(profiles, /data\.creatorMandateAccepted !== true/);
  assert.match(profiles, /creator\.distribution_mandate\.accepted/);
});

test("title submission requires active mandate and stays within account scope", () => {
  const titles = read("../src/lib/bridge/titles.ts");
  assert.match(titles, /from bridge_creator_distribution_mandates/);
  assert.match(titles, /row\.status !== "ACTIVE"/);
  assert.match(titles, /isDestinationCovered\(scope, data\.intendedDestinations/);
  assert.match(titles, /isMediaCovered\(scope, data\.media/);
  assert.match(titles, /canSublicenseWithinMandate\(scope, true\)/);
});

test("onboarding renders and submits the mandate acceptance", () => {
  const ui = read("../src/routes/onboarding.tsx");
  assert.match(ui, /checked=\{mandateAccepted\}/);
  assert.match(ui, /creatorMandateAccepted:/);
  assert.match(ui, /Submit a title later/);
});

test("migration denies direct client access and grants only service_role", () => {
  const sql = read("../migrations/20261125000100_bridge_creator_distribution_mandates.sql");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.bridge_creator_distribution_mandates from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update on public\.bridge_creator_distribution_mandates to service_role/i);
  assert.doesNotMatch(sql, /grant .* to anon|grant .* to authenticated/i);
});
