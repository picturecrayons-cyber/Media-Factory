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
