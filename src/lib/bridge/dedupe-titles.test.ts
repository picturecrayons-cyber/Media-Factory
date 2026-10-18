import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeTitlesForDisplay } from "./dedupe-titles.ts";

function title(overrides: Partial<{ id: string; name: string; language: string; year: number | null }> = {}) {
  return {
    id: "title-1",
    name: "Jananam 1947 Pranayam Thudarunnu",
    language: "Malayalam",
    year: 2024,
    ...overrides,
  };
}

describe("display-only title deduplication", () => {
  it("hides case, Unicode-normalization, and whitespace variants with the same name, language, and year", () => {
    const first = title({ id: "first" });
    const duplicate = title({ id: "duplicate", name: "  ＪＡＮＡＮＡＭ 1947   PRANAYAM THUDARUNNU " , language: " MALAYALAM " });

    assert.deepEqual(dedupeTitlesForDisplay([first, duplicate]), [first]);
  });

  it("keeps titles with a different language or year", () => {
    const original = title({ id: "original" });
    const differentLanguage = title({ id: "tamil", language: "Tamil" });
    const differentYear = title({ id: "2025", year: 2025 });

    assert.deepEqual(
      dedupeTitlesForDisplay([original, differentLanguage, differentYear]),
      [original, differentLanguage, differentYear],
    );
  });

  it("treats null year as an identity value and only deduplicates another null year", () => {
    const noYear = title({ id: "no-year", year: null });
    const duplicateNoYear = title({ id: "duplicate-no-year", year: null });
    const knownYear = title({ id: "known-year", year: 2024 });

    assert.deepEqual(dedupeTitlesForDisplay([noYear, duplicateNoYear, knownYear]), [noYear, knownYear]);
  });

  it("preserves input order and does not mutate the source array", () => {
    const newest = title({ id: "newest" });
    const olderDuplicate = title({ id: "older" });
    const source = [newest, olderDuplicate];

    const result = dedupeTitlesForDisplay(source);

    assert.deepEqual(result, [newest]);
    assert.deepEqual(source, [newest, olderDuplicate]);
  });

  it("keeps records with missing name or language visible", () => {
    const missingName = title({ id: "missing-name", name: "   " });
    const missingLanguage = title({ id: "missing-language", language: "" });

    assert.deepEqual(dedupeTitlesForDisplay([missingName, missingLanguage]), [missingName, missingLanguage]);
  });
});
