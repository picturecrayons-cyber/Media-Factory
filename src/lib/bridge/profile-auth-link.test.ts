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

test("identity resolution never falls back to email or an unlinked auth subject", () => {
  const src = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const resolver = src.match(/export async function resolveBridgeUserId[\\s\\S]*?\\n}\\n\\nexport async function loadActor/)?.[0] ?? "";
  assert.ok(resolver, "identity resolver should be present");
  assert.match(resolver, /where l\\.auth_user_id =/);
  assert.match(resolver, /l\\.verified_at is not null/);
  assert.match(resolver, /length\\(trim\\(l\\.verified_by\\)\\) > 0/);
  assert.match(resolver, /BRIDGE_IDENTITY_UNRESOLVED/);
  assert.doesNotMatch(resolver, /auth\\.users|lower\\(.*email|return .*authUserId/);
});

test("legacy single-actor internal invitations are rejected at onboarding", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /if \\(data\\.inviteToken\\) \\{[\\s\\S]*?Internal role invitations are disabled pending independent dual-control approval/);
});
