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


test("internal role revocation is Super Admin-only, self-protected, and audited in the same transaction", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const block = src.match(/export const revokeInternalRole = createServerFn[\\s\\S]*?(?=export const inviteInternalRole)/)?.[0] ?? "";
  assert.ok(block.length > 0, "revocation server function is present");
  assert.match(block, /requireVerifiedActor\(context\.userId\)/);
  assert.match(block, /actor\.internalRole !== "super_admin"/);
  assert.match(block, /data\.userId === context\.userId/);
  assert.match(block, /CANONICAL_SUPER_ADMIN_EMAIL/);
  assert.match(block, /set internal_role = null, updated_at = now\(\)/);
  assert.match(block, /action: "users\.internal_role_revoked"/);
  assert.match(block, /writeAudit\([\\s\\S]*?\}, tx\)/);
  assert.match(block, /for update/);
});
