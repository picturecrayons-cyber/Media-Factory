import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const activeFiles = [
  "package.json",
  ".env.example",
  "vite.config.ts",
  "src/lib/auth/client.ts",
  "src/lib/auth/gates.tsx",
];

const retiredFiles = [
  "src/lib/auth/server.ts",
  "src/lib/auth/gate-session.server.ts",
  "src/lib/auth/popup.server.ts",
  "src/lib/auth/providers.ts",
  "src/lib/auth/preview.ts",
  "src/lib/auth/gate-session-marker.ts",
];

test("Better Auth and Grok broker runtime are retired from active Bridge auth surfaces", () => {
  for (const path of activeFiles) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /better-auth|BETTER_AUTH_|GROK_AUTH_|__Host-grok/i, path);
  }
  for (const path of retiredFiles) {
    assert.equal(existsSync(path), false, path);
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.dependencies?.["better-auth"], undefined);
});

test("Supabase remains the canonical client auth authority", () => {
  const client = readFileSync("src/lib/auth/client.ts", "utf8");
  assert.match(client, /supabase\.auth\.signInWithPassword/);
  assert.match(client, /restoreSupabaseSession/);
  assert.match(client, /supabase\.auth\.onAuthStateChange/);
  const gates = readFileSync("src/lib/auth/gates.tsx", "utf8");
  assert.match(gates, /to=\{SIGN_IN_PATH\}/);
  assert.doesNotMatch(gates, /GROK_PROVIDERS|hasGateSessionMarker|signIn\(/);
});
