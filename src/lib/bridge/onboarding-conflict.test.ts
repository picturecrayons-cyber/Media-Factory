import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ONBOARDING_EMAIL_CONFLICT_MESSAGE,
  ONBOARDING_GENERIC_ERROR_MESSAGE,
  isBridgeProfileEmailConflict,
  publicOnboardingError,
} from "./onboarding-errors";

test("sanitizes PostgreSQL unique violations and unrelated server errors", () => {
  const dbError = Object.assign(new Error("duplicate key value violates unique constraint \"bridge_profiles_email_idx\""), {
    code: "23505",
    constraint: "bridge_profiles_email_idx",
  });
  assert.equal(isBridgeProfileEmailConflict(dbError), true);
  assert.equal(publicOnboardingError(dbError), ONBOARDING_GENERIC_ERROR_MESSAGE);
  assert.equal(publicOnboardingError(new Error("relation bridge_profiles does not exist")), ONBOARDING_GENERIC_ERROR_MESSAGE);
  assert.equal(publicOnboardingError(new Error(ONBOARDING_EMAIL_CONFLICT_MESSAGE)), ONBOARDING_EMAIL_CONFLICT_MESSAGE);
});

test("foreign identity with same email fails closed before profile insert and never auto-links by email", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const lookup = src.indexOf("select user_id from bridge_profiles where lower(email) = lower(");
  const insert = src.indexOf("insert into bridge_profiles");
  assert.ok(lookup >= 0 && insert > lookup);
  assert.match(src, /emailOwner\[0\]\?\.user_id && emailOwner\[0\]\.user_id !== context\.userId/);
  assert.doesNotMatch(src, /persistSupabaseIdentityLink\(sql, emailOwner/);
});

test("same-user and concurrent retries stay identity-bound and race-safe", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /if \(existing\) \{[\s\S]*persistSupabaseIdentityLink\(sql, existing\.userId, context\.userId\)/);
  assert.match(src, /on conflict \(user_id\) do update set/);
  assert.match(src, /isBridgeProfileEmailConflict\(error\)/);
  assert.match(src, /throw new Error\(ONBOARDING_EMAIL_CONFLICT_MESSAGE\)/);
});

test("client blocks duplicate submit and never renders arbitrary exception messages", () => {
  const src = readFileSync(new URL("../../routes/onboarding.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(submitInFlight\.current\) return/);
  assert.match(src, /setError\(publicOnboardingError\(err\)\)/);
  assert.doesNotMatch(src, /err instanceof Error \? err\.message/);
});

test("invite consumption still precedes profile insert, exposing the known atomicity failure", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const consume = src.indexOf("update bridge_invites set accepted_at = now()");
  const insert = src.indexOf("insert into bridge_profiles");
  assert.ok(consume >= 0 && insert >= 0 && consume < insert,
    "expected current bug: invite is consumed before profile creation; PR 2 must make this atomic");
});
