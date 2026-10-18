import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("signup checks password confirmation before creating an account", () => {
  const source = read("src/routes/signup.tsx");
  const validation = source.indexOf("if (password !== confirmPassword)");
  const create = source.indexOf("signUpWithEmail({");
  assert.notEqual(validation, -1);
  assert.notEqual(create, -1);
  assert.ok(validation < create);
  assert.match(source, /Passwords do not match/);
});

test("signup classifies existing accounts and displays confirmation-required state", () => {
  const source = read("src/routes/signup.tsx");
  assert.match(source, /classifySignupResult\(result\)/);
  assert.match(source, /signupState === "existing"/);
  assert.match(source, /An account with this email address already exists/);
  assert.match(source, /setSubmittedEmail\(email\.trim\(\)\)/);
  assert.match(source, /resendConfirmationEmail\(submittedEmail\)/);
});

test("login delegates next-path validation to tested safe redirect helper", () => {
  const source = read("src/routes/login.tsx");
  assert.match(source, /isSafeInternalRedirect/);
  assert.doesNotMatch(source, /function isSafeRedirect/);
});

test("callback supports OTP and PKCE and verifies both session and user", () => {
  const source = read("src/routes/auth/callback.tsx");
  assert.match(source, /supabase\.auth\.verifyOtp\(/);
  assert.match(source, /supabase\.auth\.exchangeCodeForSession\(/);
  assert.match(source, /supabase\.auth\.getSession\(/);
  assert.match(source, /supabase\.auth\.getUser\(/);
  assert.match(source, /syncSupabaseSessionUser\(\)/);
});

test("session restoration covers stale refresh tokens, PKCE rotation, and retryable infrastructure errors", () => {
  const restoration = read("src/lib/auth/session-restoration.test.ts");
  assert.match(restoration, /expired refresh token cannot fall back to a stale authenticated session/);
  assert.match(restoration, /PKCE exchange persists a session and forced refresh returns the rotated bearer/);
  const retry = read("src/lib/auth/workspace-session-retry.test.ts");
  assert.match(retry, /network failure preserves local session/);
  assert.match(retry, /auth service failure/);
  assert.match(retry, /explicit expired or missing authentication redirects once/);
});

test("role and identity gate tests remain part of the project test command", () => {
  const packageJson = read("package.json");
  assert.match(packageJson, /src\/lib\/bridge\/rbac\.test\.ts/);
  assert.match(packageJson, /src\/lib\/auth\/gate-identity\.test\.ts/);
});
