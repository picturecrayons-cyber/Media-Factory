/**
 * Legacy → canonical field map.
 * Django/StreamVista JSON dumps are migration INPUTS only — never commit them.
 */
export type LegacyTitle = {
  id?: string | number;
  pk?: string | number;
  title?: string;
  name?: string;
  title_ml?: string;
  malayalam_title?: string;
  synopsis?: string;
  description?: string;
  language?: string;
  original_language?: string;
  year?: number | string;
  release_year?: number | string;
  runtime?: number | string;
  runtime_minutes?: number;
  status?: string;
  creator_id?: string;
  creator_owner_id?: string;
  owner?: string;
};

export type CanonicalTitleInsert = {
  legacyId: string;
  name: string;
  nameMl: string | null;
  synopsis: string;
  language: string;
  year: number | null;
  runtimeMinutes: number | null;
  ownerUserId: string | null;
  status: "DRAFT";
};

const LEGACY_STATUS_TO_DRAFT = true;

export const LEGACY_TITLE_FIELD_MAP: Record<string, string> = {
  title: "name",
  name: "name",
  title_ml: "nameMl",
  malayalam_title: "nameMl",
  synopsis: "synopsis",
  description: "synopsis",
  language: "language",
  original_language: "language",
  year: "year",
  release_year: "year",
  runtime: "runtimeMinutes",
  runtime_minutes: "runtimeMinutes",
  creator_id: "ownerUserId",
  creator_owner_id: "ownerUserId",
  owner: "ownerUserId",
};

function asString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function asInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapLegacyTitle(row: LegacyTitle): CanonicalTitleInsert {
  const legacyId = asString(row.id ?? row.pk) ?? "";
  const name = asString(row.title ?? row.name);
  if (!legacyId || !name) {
    throw new Error("Legacy title missing id/name");
  }
  void LEGACY_STATUS_TO_DRAFT;
  return {
    legacyId,
    name,
    nameMl: asString(row.title_ml ?? row.malayalam_title),
    synopsis: asString(row.synopsis ?? row.description) ?? "",
    language: asString(row.language ?? row.original_language) ?? "Malayalam",
    year: asInt(row.year ?? row.release_year),
    runtimeMinutes: asInt(row.runtime_minutes ?? row.runtime),
    ownerUserId: asString(row.creator_id ?? row.creator_owner_id ?? row.owner),
    status: "DRAFT",
  };
}

export type Reconciliation = {
  sourceCount: number;
  mappedCount: number;
  skipped: { reason: string; index: number }[];
};

export function mapLegacyTitles(rows: LegacyTitle[]): {
  mapped: CanonicalTitleInsert[];
  report: Reconciliation;
} {
  const mapped: CanonicalTitleInsert[] = [];
  const skipped: Reconciliation["skipped"] = [];
  rows.forEach((row, index) => {
    try {
      mapped.push(mapLegacyTitle(row));
    } catch (err) {
      skipped.push({
        index,
        reason: err instanceof Error ? err.message : "invalid row",
      });
    }
  });
  return {
    mapped,
    report: {
      sourceCount: rows.length,
      mappedCount: mapped.length,
      skipped,
    },
  };
}
