import { describe, expect, it } from "vitest";
import { certificateDuplicateWarning, isSha256, normalizeCertificateFilename } from "./certificate-fingerprint";

describe("censor certificate fingerprints", () => {
  it("normalizes path, whitespace, and case for filename comparison", () => {
    expect(normalizeCertificateFilename("  folder\\Film   Certificate.PDF ")).toBe("film certificate.pdf");
  });

  it("accepts only a 64-character SHA-256 hex digest", () => {
    expect(isSha256("a".repeat(64))).toBe(true);
    expect(isSha256("z".repeat(64))).toBe(false);
    expect(isSha256("a".repeat(63))).toBe(false);
  });

  it("distinguishes exact-content duplicates from same-name warnings", () => {
    const digest = "b".repeat(64);
    expect(certificateDuplicateWarning({
      filename: "Certificate.pdf",
      sha256: digest,
      existing: [{ filename: "certificate.PDF", sha256: null }],
    })).toEqual({ exact: false, sameName: true });
    expect(certificateDuplicateWarning({
      filename: "new-name.pdf",
      sha256: digest.toUpperCase(),
      existing: [{ filename: "old-name.pdf", sha256: digest }],
    })).toEqual({ exact: true, sameName: false });
  });
});
