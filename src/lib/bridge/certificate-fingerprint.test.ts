import test from "node:test";
import assert from "node:assert/strict";
import { certificateDuplicateWarning, isSha256, normalizeCertificateFilename } from "./certificate-fingerprint.ts";

test("normalizes filename path, whitespace, and case", () => {
  assert.equal(normalizeCertificateFilename("  folder\\Film   Certificate.PDF "), "film certificate.pdf");
});

test("validates SHA-256 digest format", () => {
  assert.equal(isSha256("a".repeat(64)), true);
  assert.equal(isSha256("z".repeat(64)), false);
  assert.equal(isSha256("a".repeat(63)), false);
});

test("distinguishes exact content duplicates from same-name warnings", () => {
  const digest = "b".repeat(64);
  assert.deepEqual(certificateDuplicateWarning({ filename: "Certificate.pdf", sha256: digest, existing: [{ filename: "certificate.PDF", sha256: null }] }), { exact: false, sameName: true });
  assert.deepEqual(certificateDuplicateWarning({ filename: "new-name.pdf", sha256: digest.toUpperCase(), existing: [{ filename: "old-name.pdf", sha256: digest }] }), { exact: true, sameName: false });
});
