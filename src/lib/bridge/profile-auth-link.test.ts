import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("onboarding persists verified auth-to-Bridge identity binding", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /insert into bridge_loop_identity_links/);
  assert.match(src, /await persistSupabaseIdentityLink\(tx, existing\.userId, context\.userId\)/);
  assert.match(src, /auth_user_id, verification_method, verified_at, verified_by/);
  assert.match(src, /'supabase_auth_onboarding'/);
  assert.doesNotMatch(src, /public\."user"/);
  assert.match(src, /from bridge_profiles bp[\s\S]*join auth\.users au/);
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
