import type { BridgeTitle } from "./types";

function normalizeTitlePart(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

/**
 * Hide duplicate title cards without changing source records.
 * The first title wins; callers should pass their preferred display order first.
 */
export function dedupeTitlesForDisplay<T extends Pick<BridgeTitle, "name" | "language" | "year">>(
  titles: readonly T[],
): T[] {
  const seen = new Set<string>();

  return titles.filter((title) => {
    const name = normalizeTitlePart(title.name);
    const language = normalizeTitlePart(title.language);

    // Keep records with incomplete identity visible rather than accidentally hiding them.
    if (!name || !language) return true;

    const key = JSON.stringify([name, language, title.year ?? null]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
