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
  assert.ok(src.includes("on conflict (auth_user_id) do nothing"));
  assert.ok(!src.includes("on conflict (auth_user_id) do update set"));
  assert.ok(src.includes("links[0]?.bridge_user_id !== bridgeUserId"));
});

test("profile, identity link and invite consumption share one transaction", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const txStart = src.indexOf("sql.transaction(async (tx)");
  const profileInsert = src.indexOf("insert into bridge_profiles", txStart);
  const link = src.indexOf("persistSupabaseIdentityLink(tx", txStart);
  const inviteConsume = src.indexOf("update bridge_invites", txStart);
  const txEnd = src.indexOf("return roleForTransaction;", txStart);
  assert.ok(
    txStart >= 0 &&
      profileInsert > txStart &&
      link > txStart &&
      inviteConsume > txStart &&
      txEnd > txStart,
  );
  assert.ok(src.includes("await tx<"));
  assert.ok(src.includes("persistSupabaseIdentityLink(tx"));
});

test("same-email foreign identity fails before profile mutation", () => {
  const src = readFileSync(new URL("./profiles.ts", import.meta.url), "utf8");
  const txStart = src.indexOf("sql.transaction(async (tx)");
  const lookup = src.indexOf("select user_id from bridge_profiles where lower(email)", txStart);
  const insert = src.indexOf("insert into bridge_profiles", txStart);
  assert.ok(lookup > txStart && insert > lookup);
  assert.ok(src.includes("emailOwner[0]?.user_id && emailOwner[0].user_id !== context.userId"));
});

test("client synchronously locks duplicate submits and releases the lock after completion", () => {
  const src = readFileSync(new URL("../../routes/onboarding.tsx", import.meta.url), "utf8");
  const guard = src.indexOf("if (submitInFlight.current || busy) return;");
  const lock = src.indexOf("submitInFlight.current = true;", guard);
  const request = src.indexOf("await completeOnboarding(", lock);
  const finallyBlock = src.indexOf("finally {", request);
  const unlock = src.indexOf("submitInFlight.current = false;", finallyBlock);
  assert.ok(guard >= 0, "duplicate submissions must be rejected before validation or mutation");
  assert.ok(lock > guard, "the in-flight lock must be set before starting the request");
  assert.ok(request > lock, "the lock must be set before awaiting the onboarding request");
  assert.ok(finallyBlock > request && unlock > finallyBlock, "the in-flight lock must be released in finally");
  assert.ok(src.includes("setError(publicOnboardingError(err))"));
  assert.ok(!src.includes("err instanceof Error ? err.message"));
});

test("shared SQL surface exposes real transaction boundaries for both backends", () => {
  const src = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
  assert.ok(src.includes("transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>"));
  assert.ok(src.includes('await client.query("BEGIN")'));
  assert.ok(src.includes('await client.query("COMMIT")'));
  assert.ok(src.includes('await client.query("ROLLBACK")'));
  assert.ok(src.includes("pg.transaction(async (pgtx)"));
});
