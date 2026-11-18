export type TitleFilenameCandidate = {
  id: string;
  slug?: string | null;
  name?: string | null;
  nameMl?: string | null;
};

function normalizedTitleToken(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\\s+/g, " ");
}

/**
 * Detects an explicit, full canonical title prefix in an incoming filename.
 * This is a safety check, not proof of content identity; ambiguous filenames
 * remain allowed and still require human QC.
 */
export function findForeignTitleFilenameMatch(
  filename: string,
  currentTitleId: string,
  candidates: TitleFilenameCandidate[],
): TitleFilenameCandidate | null {
  const fileToken = normalizedTitleToken(filename);
  if (!fileToken) return null;
  for (const candidate of candidates) {
    if (candidate.id === currentTitleId) continue;
    const aliases = [candidate.name, candidate.nameMl, candidate.slug]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizedTitleToken(value))
      .filter((value) => value.length >= 12);
    if (aliases.some((alias) => fileToken === alias || fileToken.startsWith(alias + " "))) {
      return candidate;
    }
  }
  return null;
}
