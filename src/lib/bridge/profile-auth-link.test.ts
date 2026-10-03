import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("onboarding persists verified auth-to-Bridge identity binding", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /insert into bridge_loop_identity_links/);
  assert.match(src, /if \(existing\) \{[\s\S]*?await persistSupabaseIdentityLink\(sql, existing\.userId, context\.userId\);[\s\S]*?return \{ home: workspaceHome\(existing\), profile: existing \};/);
  assert.match(src, /await persistSupabaseIdentityLink\(tx, context\.userId, context\.userId\);/);
  assert.match(src, /auth_user_id, verification_method, verified_at, verified_by/);
  assert.match(src, /'supabase_auth_onboarding'/);
  assert.match(src, /on conflict \(auth_user_id\) do nothing/);
  assert.doesNotMatch(src, /on conflict \(auth_user_id\) do update set/);
});
