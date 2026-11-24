import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("onboarding persists verified auth-to-Bridge identity binding", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /insert into bridge_loop_identity_links/);
  assert.match(src, /await persistSupabaseIdentityLink\(tx, existing\.userId, context\.userId\)/);
  assert.match(src, /auth_user_id, verification_method, verified_at, verified_by/);
  assert.match(src, /'supabase_auth_onboarding'/);
  assert.match(src, /insert into public\."user" \(id, name, email, "emailVerified"\)/);
  assert.match(src, /where lower\(email\) = lower\(\$\{identity\.auth_email\}\)/);
  assert.match(src, /verified matching Supabase email is required/);
  assert.match(src, /on conflict \(auth_user_id\) do nothing/);
  assert.match(src, /where lower\(trim\(email\)\) = \$\{normalizedEmail\}/);
  assert.match(src, /limit 2[\s\S]*for update/);
  assert.match(src, /rows\.length !== 1/);
  assert.match(src, /select account_type[\s\S]*where user_id = \$\{bridgeUserId\}[\s\S]*for update/);
  assert.match(src, /account_type !== "independent_creator"/);
  assert.match(src, /where owner_user_id = \$\{legacyOwner\}/);
  assert.match(src, /creator\.legacy_titles_claimed/);
  assert.match(src, /claimLegacyCreatorIntake\(tx, email, bridgeUserId\)/);
  assert.match(src, /claimLegacyCreatorIntake\(tx, email \?\? existing\.email, existing\.userId\)/);
  assert.doesNotMatch(src, /on conflict \(auth_user_id\) do update set/);
});


test("Creator/Studio onboarding requires explicit versioned mandate acceptance and transactional audit", () => {
  const profiles = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const mandate = readFileSync(new URL("./distribution-mandate.ts", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("../../routes/onboarding.tsx", import.meta.url), "utf8");
  assert.match(profiles, /creatorMandateAccepted: z\\.boolean\\(\\)\\.optional\\(\\)/);
  assert.match(profiles, /await acceptDistributionMandate\\(tx, bridgeUserId\\)/);
  assert.match(profiles, /await acceptDistributionMandate\\(tx, existing\\.userId\\)/);
  assert.match(mandate, /creator\\.distribution_mandate\\.accepted/);
  assert.match(onboarding, /type="checkbox" checked=\\{mandateAccepted\\}/);
  assert.match(onboarding, /creatorMandateAccepted:/);
  assert.match(onboarding, /getDistributionMandateStatus/);
});
test("all Creator/Studio title creation endpoints require an active mandate", () => {
  for (const path of ["./titles.ts", "./submissions.ts", "./story-concept-api.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requireActiveDistributionMandate/);
  }
});
test("mandate migration uses a versioned key, RLS and service-role-only grants", () => {
  const migration = readFileSync(new URL("../../../migrations/0024_bridge_creator_distribution_mandates.sql", import.meta.url), "utf8");
  assert.match(migration, /primary key \\(creator_user_id, mandate_version\\)/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\\.bridge_creator_distribution_mandates from anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\\.bridge_creator_distribution_mandates to service_role/i);
});
