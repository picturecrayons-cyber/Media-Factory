import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const activeFiles = [
  "package.json",
  ".env.example",
  "vite.config.ts",
  "src/lib/auth/client.ts",
];

test("Better Auth runtime is retired from active Bridge auth surfaces", () => {
  for (const path of activeFiles) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /better-auth|BETTER_AUTH_|__Host-grok-auth\.session_token/i, path);
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.dependencies?.["better-auth"], undefined);
});

test("Supabase remains the canonical client auth authority", () => {
  const client = readFileSync("src/lib/auth/client.ts", "utf8");
  assert.match(client, /supabase\.auth\.signInWithPassword/);
  assert.match(client, /restoreSupabaseSession/);
  assert.match(client, /supabase\.auth\.onAuthStateChange/);
});
