import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261116083000_harden_bridge_title_owner_helper.sql", import.meta.url),
  "utf8",
);

test("Bridge title owner helper pins SECURITY DEFINER search_path to pg_catalog", () => {
  assert.match(migration, /security\s+definer/i);
  assert.match(migration, /set\s+search_path\s*=\s*pg_catalog/i);
});

test("Bridge title owner helper uses schema-qualified identity and title relations", () => {
  assert.match(migration, /from\s+public\.bridge_titles/i);
  assert.match(migration, /join\s+public\.bridge_loop_identity_links/i);
  assert.match(migration, /auth\.uid\(\)/i);
});

test("Bridge title owner helper denies anon and PUBLIC while preserving RLS execution", () => {
  assert.match(migration, /revoke\s+all\s+on\s+function\s+public\.bridge_is_title_owner\(text\)\s+from\s+public,\s*anon/i);
  assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.bridge_is_title_owner\(text\)\s+to\s+authenticated/i);
});
