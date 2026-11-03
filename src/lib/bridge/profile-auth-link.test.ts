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

test("identity resolver requires direct immutable auth subject and rejects legacy/email inference", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function resolveBridgeUserId");
  const end = source.indexOf("export async function loadActor", start);
  const resolver = source.slice(start, end);
  assert.ok(resolver.includes("requireDirectBridgeIdentity"));
  assert.equal(resolver.includes("bridge_loop_identity_links"), false);
  assert.equal(resolver.includes("auth.users"), false);
  assert.equal(resolver.toLowerCase().includes("email"), false);
});
