import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("onboarding persists verified Supabase Auth-to-Bridge identity binding", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /insert into bridge_loop_identity_links/);
  assert.match(src, /await persistSupabaseIdentityLink\\(sql, existing\\.userId, context\\.userId\\)/);
  assert.match(src, /auth_user_id, verification_method, verified_at, verified_by/);
  assert.match(src, /'supabase_auth_onboarding'/);
  assert.match(src, /on conflict \\(auth_user_id\\) do nothing/);
  assert.match(src, /where lower\\(email\\) = lower\\(\\$\\{email\\}\\)/);
  assert.doesNotMatch(src, /on conflict \\(auth_user_id\\) do update set/);
});

test("identity migration references Bridge profiles and Supabase Auth, not Better Auth users", () => {
  const migration = readFileSync(
    new URL("../../../migrations/0007a_identity_links.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /references public\\.bridge_profiles\\(user_id\\) on delete restrict/);
  assert.match(migration, /references auth\\.users\\(id\\) on delete cascade/);
  assert.doesNotMatch(migration, /references public\\."user"\\(id\\)/);
});

test("Scope A database harness refuses non-disposable or remote databases", () => {
  const src = readFileSync(
    new URL("../../../scripts/scope-a-onboarding-db.mjs", import.meta.url),
    "utf8",
  );
  assert.match(src, /SCOPE_A_DISPOSABLE_DATABASE !== "1"/);
  assert.match(src, /allowedHosts/);
  assert.match(src, /databaseName !== "bridge_scope_a"/);
  assert.match(src, /Bridge-profile FK orphan rejection/);
  assert.match(src, /Supabase Auth FK orphan rejection/);
});
