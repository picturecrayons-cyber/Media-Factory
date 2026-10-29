/** Pure helpers for censor-certificate duplicate warnings. */
export function normalizeCertificateFilename(filename: string): string {
  return filename
    .normalize("NFKC")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

export function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

export function certificateDuplicateWarning(args: {
  filename: string;
  sha256: string;
  existing: Array<{ filename: string | null; sha256: string | null }>;
}): { exact: boolean; sameName: boolean } {
  const hash = args.sha256.toLowerCase();
  return {
    exact: args.existing.some((item) => item.sha256?.toLowerCase() === hash),
    sameName: args.existing.some((item) =>
      item.filename != null &&
      normalizeCertificateFilename(item.filename) === normalizeCertificateFilename(args.filename),
    ),
  };
}
