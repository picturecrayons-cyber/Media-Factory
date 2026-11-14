import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("onboarding persists verified auth-to-Bridge identity binding", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /insert into bridge_loop_identity_links/);
  assert.match(src, /await persistSupabaseIdentityLink\(sql, existing\.userId, context\.userId\)/);
  assert.match(src, /auth_user_id, verification_method, verified_at, verified_by/);
  assert.match(src, /'supabase_auth_onboarding'/);
  assert.match(src, /on conflict \(auth_user_id\) do nothing/);
  assert.match(src, /where lower\(email\) = lower\(\$\{email\}\)/);
  assert.doesNotMatch(src, /on conflict \(auth_user_id\) do update set/);
});


test("Super Admin invite acceptance is allowlisted and accepted internal roles are audited", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /canGrantInternalRoleToEmail\(actor, data\.role, data\.email\)/);
  assert.match(src, /inv\.internal_role === "super_admin"[\s\S]*?CANONICAL_SUPER_ADMIN_EMAIL/);
  assert.match(src, /action: "users\.internal_role_granted"/);
  assert.match(src, /metadata:[\s\S]*?role: internalRole,[\s\S]*?inviteId/);
});
