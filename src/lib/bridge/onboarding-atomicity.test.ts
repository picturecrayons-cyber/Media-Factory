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

test("profile, identity link and invite consumption share one transaction", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const txStart = src.indexOf("sql.transaction(async (tx)");
  const profileInsert = src.indexOf("insert into bridge_profiles", txStart);
  const link = src.indexOf("persistSupabaseIdentityLink(tx", txStart);
  const inviteConsume = src.indexOf("update bridge_invites", link);
  const txEnd = src.indexOf("return invitedRole;", inviteConsume);
  assert.ok(txStart >= 0 && profileInsert > txStart && link > profileInsert && inviteConsume > link && txEnd > inviteConsume);
  assert.match(src, /for update/);
});

test("same-email foreign identity fails before profile mutation", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const txStart = src.indexOf("sql.transaction(async (tx)");
  const lookup = src.indexOf("select user_id from bridge_profiles where lower(email)", txStart);
  const insert = src.indexOf("insert into bridge_profiles", txStart);
  assert.ok(lookup > txStart && insert > lookup);
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
