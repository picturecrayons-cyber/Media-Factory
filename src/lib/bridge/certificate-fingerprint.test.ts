import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { certificateDuplicateWarning, isSha256, normalizeCertificateFilename } from "./certificate-fingerprint.ts";

describe("censor-certificate duplicate fingerprints", () => {
  it("normalizes filenames without treating filename equality as proof", () => {
    assert.equal(normalizeCertificateFilename(" C:\\Uploads\\Certificate.PDF "), "certificate.pdf");
  });

  it("recognizes valid SHA-256 fingerprints", () => {
    assert.equal(isSha256("a".repeat(64)), true);
    assert.equal(isSha256("etag-not-a-sha256"), false);
  });

  it("flags identical content and same-name candidates separately", () => {
    const result = certificateDuplicateWarning({
      filename: "Certificate.pdf",
      sha256: "a".repeat(64),
      existing: [
        { filename: "certificate.pdf", sha256: "b".repeat(64) },
        { filename: "old-copy.pdf", sha256: "A".repeat(64) },
      ],
    });
    assert.deepEqual(result, { exact: true, sameName: true });
  });

  it("does not claim exact duplication when only the filename matches", () => {
    const result = certificateDuplicateWarning({
      filename: "Certificate.pdf",
      sha256: "a".repeat(64),
      existing: [{ filename: "certificate.pdf", sha256: null }],
    });
    assert.deepEqual(result, { exact: false, sameName: true });
  });
});
