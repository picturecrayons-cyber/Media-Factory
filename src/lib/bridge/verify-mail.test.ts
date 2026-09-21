import assert from "node:assert/strict";
import test from "node:test";
import {
  assertVerifyResendAllowed,
  canonicalVerifyUrl,
  verificationEmailCopy,
} from "./verify-mail.ts";

test("verify URL is canonical https and rejects open redirects", () => {
  const token = "a".repeat(64);
  const url = canonicalVerifyUrl("https://bridge.crayonspictures.com/", token);
  assert.equal(url, `https://bridge.crayonspictures.com/verify-email?token=${token}`);
  assert.throws(() => canonicalVerifyUrl("https://evil.example/phishing", token), /not allowed/);
  assert.throws(() => canonicalVerifyUrl("https://bridge.crayonspictures.com", "short"), /Invalid token/);
});

test("resend is throttled", () => {
  const now = new Date("2026-09-22T00:00:00Z");
  assert.doesNotThrow(() => assertVerifyResendAllowed(null, now));
  assert.throws(
    () => assertVerifyResendAllowed(new Date("2026-09-21T23:59:00Z"), now),
    /two minutes/,
  );
});

test("verification copy never includes SMTP secrets", () => {
  const copy = verificationEmailCopy({
    displayName: "Studio",
    url: "https://bridge.crayonspictures.com/verify-email?token=abc",
    to: "owner@studio.example",
  });
  const blob = `${copy.subject}\n${copy.text}\n${copy.html}`;
  assert.match(blob, /Crayons Bridge/);
  assert.doesNotMatch(blob, /SMTP_PASS/);
  assert.doesNotMatch(blob, /HOSTINGER_SMTP_PASS/);
  assert.match(copy.html, /Verify email/);
});
