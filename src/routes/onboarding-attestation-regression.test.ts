import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");

test("restoring a saved onboarding draft never restores legal attestation", () => {
  const restoreStart = source.indexOf("const raw = window.localStorage.getItem(draftKey)");
  assert.notEqual(restoreStart, -1, "saved-draft restore path must exist");
  const restoreEnd = source.indexOf('setDraftStatus("Saved draft restored from this browser.")', restoreStart);
  assert.notEqual(restoreEnd, -1, "saved-draft restore path must report restoration");
  const restorePath = source.slice(restoreStart, restoreEnd);

  assert.match(
    restorePath,
    /setAuthorizationAttested\(false\)/,
    "restore must explicitly clear the attestation regardless of the stored value",
  );
  assert.doesNotMatch(
    restorePath,
    /setAuthorizationAttested\(d\.authorizationAttested\)/,
    "a persisted true value must never be copied into live attestation state",
  );
});

test("submission is blocked until the user explicitly re-affirms authorization", () => {
  const submitStart = source.indexOf("async function onSubmit(e: FormEvent)");
  assert.notEqual(submitStart, -1, "onboarding submit handler must exist");
  const submitEnd = source.indexOf("\n  }", submitStart);
  const submitPath = source.slice(submitStart, submitEnd === -1 ? undefined : submitEnd);

  const attestationGuard = submitPath.indexOf(
    'if (!authorizationAttested) throw new Error("Confirm that you have authority to license the submitted rights")',
  );
  assert.notEqual(attestationGuard, -1, "submit handler must fail closed when attestation is false");

  const profileWrite = submitPath.indexOf("await completeOnboarding(");
  const titleWrite = submitPath.indexOf("await createTitle(");
  assert.ok(profileWrite === -1 || attestationGuard < profileWrite,
    "attestation guard must run before profile/onboarding mutation");
  assert.ok(titleWrite === -1 || attestationGuard < titleWrite,
    "attestation guard must run before title creation");

  assert.match(
    source,
    /<input required type="checkbox" checked=\{authorizationAttested\} onChange=\{\(e\) => setAuthorizationAttested\(e\.target\.checked\)\}/,
    "the user must explicitly check the required attestation control",
  );
});
