export function isBuyerVisibleLanguageRight(status: string): boolean {
  return status === "VALID";
}

export function isBuyerVisibleLicensePackage(
  status: string,
  languageRightIds: readonly string[],
  validRightIds: ReadonlySet<string>,
): boolean {
  return (
    (status === "READY" || status === "IN_NEGOTIATION") &&
    languageRightIds.length > 0 &&
    languageRightIds.every((id) => validRightIds.has(id))
  );
}

export type BuyerLanguageRightRow = {
  id: string;
  language: string;
  right_type: string;
  territories: unknown;
  media: unknown;
  window_start: string | Date | null;
  window_end: string | Date | null;
  exclusivity: string;
  status: string;
};

/** Customer-safe allowlist; only currently valid rights reach this mapper. */
export function toBuyerVisibleLanguageRight(row: BuyerLanguageRightRow) {
  return {
    id: row.id,
    language: row.language,
    rightType: row.right_type,
    territories: Array.isArray(row.territories) ? row.territories : [],
    media: Array.isArray(row.media) ? row.media : [],
    windowStart: row.window_start ? String(row.window_start) : null,
    windowEnd: row.window_end ? String(row.window_end) : null,
    exclusivity: row.exclusivity,
    status: row.status,
  };
}
