import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("onboarding persists verified Supabase Auth-to-Bridge identity binding", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.ok(src.includes("insert into bridge_loop_identity_links"));
  assert.ok(src.includes("persistSupabaseIdentityLink(sql, existing.userId, context.userId)"));
  assert.ok(src.includes("auth_user_id, verification_method, verified_at, verified_by"));
  assert.ok(src.includes("'supabase_auth_onboarding'"));
  assert.ok(src.includes("on conflict (auth_user_id) do nothing"));
  assert.ok(src.includes("where lower(email) = lower(${email})"));
  assert.ok(!src.includes("on conflict (auth_user_id) do update set"));
});

test("identity migrations reference Bridge profiles and Supabase Auth, not Better Auth users", () => {
  const migration = readFileSync(
    new URL("../../../migrations/0007a_identity_links.sql", import.meta.url),
    "utf8",
  );
  assert.ok(migration.includes("references public.bridge_profiles(user_id) on delete restrict"));
  assert.ok(migration.includes("references auth.users(id) on delete cascade"));
  assert.ok(!migration.includes('references public."user"(id)'));

  const repair = readFileSync(
    new URL("../../../migrations/0023_bridge_identity_fk_repair.sql", import.meta.url),
    "utf8",
  );
  assert.ok(repair.includes("drop constraint if exists bridge_loop_identity_links_bridge_user_id_fkey"));
  assert.ok(repair.includes("references public.bridge_profiles(user_id)"));
  assert.ok(repair.includes("references auth.users(id)"));
});

test("Scope A database harness refuses non-disposable or remote databases", () => {
  const src = readFileSync(
    new URL("../../../scripts/scope-a-onboarding-db.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(src.includes('SCOPE_A_DISPOSABLE_DATABASE !== "1"'));
  assert.ok(src.includes("allowedHosts"));
  assert.ok(src.includes('databaseName !== "bridge_scope_a"'));
  assert.ok(src.includes("Bridge-profile FK orphan rejection"));
  assert.ok(src.includes("Supabase Auth FK orphan rejection"));
  assert.ok(src.includes("await client.query(\"rollback\")"));
});

test("session resolution fails closed without a direct immutable Supabase subject", () => {
  const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function resolveBridgeUserId");
  const end = source.indexOf("export async function loadActor", start);
  const resolver = source.slice(start, end);
  assert.ok(resolver.includes("requireDirectBridgeIdentity"));
  assert.ok(!resolver.includes("bridge_loop_identity_links"));
  assert.ok(!/auth\.users|lower\s*\(\s*email/i.test(resolver));

  const guards = readFileSync(new URL("./authorization-guards.ts", import.meta.url), "utf8");
  assert.ok(guards.includes("directProfileUserId === authUserId"));
  assert.ok(guards.includes("BRIDGE_IDENTITY_UNRESOLVED"));
});
