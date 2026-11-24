import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Creator and Studio mandate is enforced by the authenticated server action", () => {
  const profiles = read("../src/lib/bridge/profiles.ts");
  assert.match(profiles, /creatorMandateAccepted:\s*z\.boolean\(\)\.optional\(\)/);
  assert.match(profiles, /data\.creatorMandateAccepted !== true/);
  assert.match(profiles, /data\.accountType === "independent_creator" \|\| data\.accountType === "studio"/);
  assert.match(profiles, /insert into bridge_creator_distribution_mandates/);
  assert.match(profiles, /creator\.distribution_mandate\.accepted/);
});

test("onboarding captures and sends the acceptance for both workspace paths", () => {
  const ui = read("../src/routes/onboarding.tsx");
  assert.match(ui, /const \[mandateAccepted, setMandateAccepted\] = useState\(false\)/);
  assert.match(ui, /checked=\{mandateAccepted\}/);
  assert.match(ui, /creatorMandateAccepted: accountType === "buyer" \? undefined : mandateAccepted/);
  assert.ok((ui.match(/creatorMandateAccepted:/g) || []).length >= 2);
  assert.match(ui, /completed\.home/);
});

test("mandate migration is service-role-only and RLS enabled", () => {
  const sql = read("../migrations/20261125120000_bridge_creator_distribution_mandates.sql");
  assert.match(sql, /references public\.bridge_profiles\(user_id\)/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.bridge_creator_distribution_mandates from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update on table public\.bridge_creator_distribution_mandates to service_role/i);
  assert.doesNotMatch(sql, /grant .* to anon|grant .* to authenticated/i);
});
