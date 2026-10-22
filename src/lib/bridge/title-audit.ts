export type TitleAuditRecord = {
  id: string;
  name: string;
  language?: string | null;
  original_language?: string | null;
  year?: number | string | null;
  status?: string | null;
};

export type TitleAuditGroup = {
  key: string;
  normalizedTitle: string;
  records: TitleAuditRecord[];
  language: string | null;
  year: number | null;
  classification: "MATCHED_IDENTITY_CANDIDATES" | "METADATA_REVIEW";
};

export function normalizeAuditTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function normalizeLanguage(value: string | null | undefined): string | null {
  const normalized = value?.normalize("NFKC").trim().toLocaleLowerCase("en");
  return normalized || null;
}

function normalizeYear(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1888 && year <= 2200 ? year : null;
}

/** Read-only discovery: complete title+language+year is required for identity candidates. */
export function buildTitleAuditGroups(records: TitleAuditRecord[]): TitleAuditGroup[] {
  const byTitle = new Map<string, TitleAuditRecord[]>();
  for (const record of records) {
    const title = normalizeAuditTitle(record.name ?? "");
    if (!title) continue;
    const group = byTitle.get(title) ?? [];
    group.push(record);
    byTitle.set(title, group);
  }
  const result: TitleAuditGroup[] = [];
  for (const [normalizedTitle, sameTitle] of byTitle) {
    if (sameTitle.length < 2) continue;
    const complete = new Map<string, TitleAuditRecord[]>();
    const incomplete: TitleAuditRecord[] = [];
    for (const record of sameTitle) {
      const language = normalizeLanguage(record.original_language ?? record.language);
      const year = normalizeYear(record.year);
      if (!language || year === null) { incomplete.push(record); continue; }
      const key = `${normalizedTitle}|${language}|${year}`;
      const bucket = complete.get(key) ?? [];
      bucket.push(record);
      complete.set(key, bucket);
    }
    for (const [key, matching] of complete) {
      if (matching.length < 2) continue;
      result.push({
        key, normalizedTitle, records: matching,
        language: normalizeLanguage(matching[0].original_language ?? matching[0].language),
        year: normalizeYear(matching[0].year),
        classification: "MATCHED_IDENTITY_CANDIDATES",
      });
    }
    if (incomplete.length) result.push({
      key: `${normalizedTitle}|metadata-review`, normalizedTitle, records: incomplete,
      language: null, year: null, classification: "METADATA_REVIEW",
    });
  }
  return result.sort((a, b) => a.normalizedTitle.localeCompare(b.normalizedTitle) || (a.year ?? 0) - (b.year ?? 0));
}
