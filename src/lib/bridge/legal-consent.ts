import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

// Bump the version and recompute the source-file SHA-256 whenever either
// published legal document changes. These hashes identify the committed
// document source, not a rendered PDF or a qualified electronic signature.
export const CURRENT_BRIDGE_LEGAL_DOCUMENTS = {
  terms: {
    version: "2026-10-09",
    sha256: "8cb076fc995f2bd70f561177bacbd734de09c9df0ce74757d6e121748a0819a0",
  },
  privacy: {
    version: "2026-10-01",
    sha256: "b8a2bc83953c2a582d8027b02549051263ee6d586d5f0ca6111ebb19614f6678",
  },
} as const;

type DocumentKey = keyof typeof CURRENT_BRIDGE_LEGAL_DOCUMENTS;

export const getLegalConsentStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      document_key: DocumentKey;
      document_version: string;
      document_sha256: string;
    }>`
      select distinct on (document_key)
        document_key, document_version, document_sha256
      from private.bridge_legal_consents
      where auth_user_id = ${context.userId}::uuid
      order by document_key, accepted_at desc
    `;
    const accepted = new Set(
      rows
        .filter((row) => {
          const current = CURRENT_BRIDGE_LEGAL_DOCUMENTS[row.document_key];
          return row.document_version === current.version && row.document_sha256 === current.sha256;
        })
        .map((row) => row.document_key),
    );
    return {
      required: !accepted.has("terms") || !accepted.has("privacy"),
      termsAccepted: accepted.has("terms"),
      privacyAccepted: accepted.has("privacy"),
      documents: CURRENT_BRIDGE_LEGAL_DOCUMENTS,
    };
  });

export const recordLegalConsent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { acceptedTerms: boolean; acceptedPrivacy: boolean }) => {
    if (input.acceptedTerms !== true || input.acceptedPrivacy !== true) {
      throw new Error("Both current legal documents must be acknowledged.");
    }
    return input;
  })
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql.transaction(async (tx) => {
      for (const documentKey of ["terms", "privacy"] as const satisfies readonly DocumentKey[]) {
        const document = CURRENT_BRIDGE_LEGAL_DOCUMENTS[documentKey];
        const existing = await tx<{ id: string }>`
          select id
          from private.bridge_legal_consents
          where auth_user_id = ${context.userId}::uuid
            and document_key = ${documentKey}
            and document_version = ${document.version}
            and document_sha256 = ${document.sha256}
          limit 1
        `;
        if (existing.length === 0) {
          await tx`
            insert into private.bridge_legal_consents
              (auth_user_id, document_key, document_version, document_sha256)
            values
              (${context.userId}::uuid, ${documentKey}, ${document.version}, ${document.sha256})
          `;
        }
      }
    });
    return { success: true };
  });
