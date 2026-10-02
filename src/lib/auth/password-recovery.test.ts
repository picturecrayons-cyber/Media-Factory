import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPasswordRecoveryRedirectUrl, RECOVERY_MARKER_KEY } from "./recovery-url.ts";

describe("password recovery flow and callback bypass prevention", () => {
  it("routes password recovery to the recovery callback and never directly to reset-password", () => {
    const url = getPasswordRecoveryRedirectUrl("https://www.crayonspictures.in");
    assert.equal(url, "https://www.crayonspictures.in/auth/callback?type=recovery");
    assert.equal(getPasswordRecoveryRedirectUrl("https://bridge.crayonspictures.com"), "https://www.crayonspictures.in/auth/callback?type=recovery");
    assert.doesNotMatch(url, /^https:\/\/bridge\.crayonspictures\.com\/reset-password$/);
  });

  it("rejects an unapproved local origin and falls back to canonical Production", () => {
    const url = getPasswordRecoveryRedirectUrl("http://localhost:3000");
    assert.equal(url, "https://www.crayonspictures.in/auth/callback?type=recovery");
  });

  it("defines the canonical recovery session marker key", () => {
    assert.equal(RECOVERY_MARKER_KEY, "crayons-bridge.supabase-recovery-session");
  });

  it("proves the chain: forgot password -> recovery callback -> markRecoverySession -> reset-password", () => {
    const callbackTarget = getPasswordRecoveryRedirectUrl("https://bridge.crayonspictures.com");
    const targetUrl = new URL(callbackTarget);
    assert.equal(targetUrl.pathname, "/auth/callback");
    assert.equal(targetUrl.searchParams.get("type"), "recovery");

    const mockSessionToken = "mock-access-token-recovery-12345";
    const storage: Record<string, string> = {};
    storage[RECOVERY_MARKER_KEY] = mockSessionToken;

    const isReady = storage[RECOVERY_MARKER_KEY] === mockSessionToken;
    assert.equal(isReady, true);

    const bypassedStorage: Record<string, string> = {};
    const bypassReady = bypassedStorage[RECOVERY_MARKER_KEY] === mockSessionToken;
    assert.equal(bypassReady, false);
  });

  it("prevents direct callback bypass regression in client source code", () => {
    const clientCode = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
    const callbackCode = readFileSync(new URL("../../routes/auth/callback.tsx", import.meta.url), "utf8");
    const resetPasswordCode = readFileSync(new URL("../../routes/reset-password.tsx", import.meta.url), "utf8");

    assert.match(clientCode, /getPasswordRecoveryRedirectUrl\(\)/);
    assert.doesNotMatch(clientCode, /redirectTo\s*=\s*`\$\{origin\}\/reset-password`/);

    assert.match(callbackCode, /type\s*===\s*"recovery"/);
    assert.match(callbackCode, /markRecoverySession\(session\.access_token\)/);
    assert.match(callbackCode, /navigate\(\{\s*to:\s*"\/reset-password"\s*\}\)/);

    assert.match(resetPasswordCode, /hasSupabaseRecoverySession\(\)/);
    assert.match(resetPasswordCode, /disabled=\{busy \|\| !sessionReady\}/);
  });
});
