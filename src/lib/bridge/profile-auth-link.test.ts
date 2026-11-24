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
  assert.ok(profiles.includes("creatorMandateAccepted: z.boolean().optional()"));
  assert.ok(profiles.includes("await acceptDistributionMandate(tx, bridgeUserId)"));
  assert.ok(profiles.includes("await acceptDistributionMandate(tx, existing.userId)"));
  assert.ok(mandate.includes('action: "creator.distribution_mandate.accepted"'));
  assert.ok(onboarding.includes('type="checkbox" checked={mandateAccepted}'));
  assert.ok(onboarding.includes("creatorMandateAccepted:"));
  assert.ok(onboarding.includes("getDistributionMandateStatus"));
});
test("all Creator/Studio title creation endpoints require an active mandate", () => {
  for (const path of ["./titles.ts", "./submissions.ts", "./story-concept-api.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(source.includes("requireActiveDistributionMandate"), path);
  }
});
test("mandate migration uses a versioned key, RLS and service-role-only grants", () => {
  const migration = readFileSync(new URL("../../../migrations/0024_bridge_creator_distribution_mandates.sql", import.meta.url), "utf8");
  assert.ok(migration.includes("primary key (creator_user_id, mandate_version)"));
  assert.ok(migration.includes("enable row level security"));
  assert.ok(migration.includes("revoke all on table public.bridge_creator_distribution_mandates from anon, authenticated"));
  assert.ok(migration.includes("grant select, insert, update on table public.bridge_creator_distribution_mandates to service_role"));
});
