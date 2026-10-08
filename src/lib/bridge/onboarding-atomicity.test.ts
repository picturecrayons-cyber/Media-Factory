import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ONBOARDING_EMAIL_CONFLICT_MESSAGE,
  ONBOARDING_GENERIC_ERROR_MESSAGE,
  isBridgeProfileEmailConflict,
  publicOnboardingError,
} from "./onboarding-errors.ts";

test("sanitizes database errors while preserving approved onboarding messages", () => {
  const dbError = Object.assign(new Error("duplicate key"), {
    code: "23505",
    constraint: "bridge_profiles_email_idx",
  });
  assert.equal(isBridgeProfileEmailConflict(dbError), true);
  assert.equal(publicOnboardingError(dbError), ONBOARDING_GENERIC_ERROR_MESSAGE);
  assert.equal(publicOnboardingError(new Error(ONBOARDING_EMAIL_CONFLICT_MESSAGE)), ONBOARDING_EMAIL_CONFLICT_MESSAGE);
});

test("identity links fail closed and never reassign an auth identity", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  assert.match(src, /on conflict \(auth_user_id\) do nothing/);
  assert.doesNotMatch(src, /on conflict \(auth_user_id\) do update set/);
  assert.match(src, /links\[0\]\?\.bridge_user_id !== bridgeUserId/);
});

test("profile creation and invite consumption share one database statement", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const handlerStart = src.indexOf("export const completeOnboarding");
  const inviteCte = src.indexOf("with consumed_invite as (", handlerStart);
  const inviteUpdate = src.indexOf("update bridge_invites", inviteCte);
  const profileInsert = src.indexOf("insert into bridge_profiles", inviteUpdate);
  const returning = src.indexOf("returning user_id", profileInsert);
  assert.ok(handlerStart >= 0 && inviteCte > handlerStart && inviteUpdate > inviteCte);
  assert.ok(profileInsert > inviteUpdate && returning > profileInsert);
  assert.match(src, /set accepted_at = now\(\)/);
});

test("same-email foreign identity fails before profile mutation", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const handlerStart = src.indexOf("export const completeOnboarding");
  const lookup = src.indexOf("select user_id from bridge_profiles where lower(email)", handlerStart);
  const insert = src.indexOf("insert into bridge_profiles", handlerStart);
  assert.ok(lookup > handlerStart && insert > lookup);
  assert.match(src, /emailOwner\[0\]\?\.user_id && emailOwner\[0\]\.user_id !== context\.userId/);
});

test("client blocks duplicate submit and never renders arbitrary server errors", () => {
  const src = readFileSync(new URL("../../routes/onboarding.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(submitInFlight\.current\) return/);
  assert.match(src, /setError\(publicOnboardingError\(err\)\)/);
  assert.doesNotMatch(src, /err instanceof Error \? err\.message/);
});

test("shared SQL surface exposes real transaction boundaries for both backends", () => {
  const src = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
  assert.match(src, /transaction<T>\(fn: \(tx: Sql\) => Promise<T>\): Promise<T>/);
  assert.match(src, /await client\.query\("BEGIN"\)/);
  assert.match(src, /await client\.query\("COMMIT"\)/);
  assert.match(src, /await client\.query\("ROLLBACK"\)/);
  assert.match(src, /pg\.transaction\(async \(pgtx\)/);
});
