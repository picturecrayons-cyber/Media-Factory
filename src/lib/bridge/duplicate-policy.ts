export type MergeDecision = "SAFE" | "HOLD" | "BLOCK";

export type MergeTitle = {
  id: string;
  name: string;
  slug?: string;
  language?: string | null;
  status: string;
  owner_user_id?: string | null;
  year?: number | null;
  runtime_minutes?: number | null;
  content_type?: string | null;
  original_language?: string | null;
  poster_key?: string | null;
  master_key?: string | null;
};

export type MergeRights = {
  id: string;
  territories: unknown;
  languages: unknown;
  window_start: string | Date | null;
  window_end: string | Date | null;
  exclusivity: string | null;
  status: string;
};

export type MergeEvaluationInput = {
  identityCertain: boolean;
  canonical: MergeTitle;
  retiring: MergeTitle;
  canonicalRights: MergeRights[];
  retiringRights: MergeRights[];
  canonicalBuyers: unknown[];
  retiringBuyers: unknown[];
  canonicalAssets: unknown[];
  retiringAssets: unknown[];
  canonicalDeliveries: unknown[];
  retiringDeliveries: unknown[];
  canonicalLoopPublications: unknown[];
  retiringLoopPublications: unknown[];
};

export function normalizeTitleText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, " ") // replace non-alphanumeric with space
    .trim()
    .replace(/\s+/g, " "); // collapse multiple spaces
}

export function normalizeContentType(type: string | null | undefined): string {
  if (!type) return "FEATURE";
  const cleaned = type.trim().toUpperCase().replace(/[^A-Z]/g, "_");
  if (["FILM", "FEATURE", "MOVIE", "FEATURE_FILM"].includes(cleaned)) return "FEATURE";
  if (["SERIES", "WEB_SERIES", "SHOW", "TV_SERIES"].includes(cleaned)) return "SERIES";
  if (["SHORT", "SHORT_FILM"].includes(cleaned)) return "SHORT";
  if (["DOCUMENTARY", "DOC"].includes(cleaned)) return "DOCUMENTARY";
  return cleaned;
}

export function generateTitleDeduplicationKey(title: {
  name: string;
  language?: string | null;
  year?: number | string | null;
  contentType?: string | null;
  content_type?: string | null;
}): string {
  const normName = normalizeTitleText(title.name);
  const normLang = (title.language || "").trim().toLowerCase();
  const normYear = title.year ? String(title.year).trim() : "unknown";
  const normType = normalizeContentType(title.contentType || title.content_type);
  return `${normName}::${normLang}::${normYear}::${normType}`;
}

export function detectDuplicateGroups<
  T extends {
    id: string;
    name: string;
    language?: string | null;
    year?: number | string | null;
    contentType?: string | null;
    content_type?: string | null;
    status?: string;
  },
>(titles: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const t of titles) {
    const key = generateTitleDeduplicationKey(t);
    const existing = groups.get(key) || [];
    existing.push(t);
    groups.set(key, existing);
  }
  // Filter only groups with 2 or more titles
  const duplicateGroups = new Map<string, T[]>();
  for (const [key, group] of groups.entries()) {
    if (group.length > 1) {
      duplicateGroups.set(key, group);
    }
  }
  return duplicateGroups;
}

function setOf(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean),
  );
}

function equalSet(a: unknown, b: unknown): boolean {
  const aa = setOf(a);
  const bb = setOf(b);
  if (!aa.size && !bb.size) return true;
  if (!aa.size || !bb.size) return false;
  return aa.size === bb.size && [...aa].every((v) => bb.has(v));
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalized(entry)]),
    );
  }
  return value;
}

function time(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}

function windowsConflict(a: MergeRights, b: MergeRights): boolean {
  const aStart = time(a.window_start);
  const aEnd = time(a.window_end);
  const bStart = time(b.window_start);
  const bEnd = time(b.window_end);
  if (aStart === null && aEnd === null && bStart === null && bEnd === null) return false;
  const startA = aStart ?? Number.NEGATIVE_INFINITY;
  const endA = aEnd ?? Number.POSITIVE_INFINITY;
  const startB = bStart ?? Number.NEGATIVE_INFINITY;
  const endB = bEnd ?? Number.POSITIVE_INFINITY;
  return startA < endB && startB < endA;
}

function rightsConflict(a: MergeRights, b: MergeRights) {
  const languageConflict = !equalSet(a.languages, b.languages);
  const territoryConflict = !equalSet(a.territories, b.territories);
  const exclusivityConflict =
    Boolean(a.exclusivity && b.exclusivity) &&
    a.exclusivity!.toUpperCase() !== b.exclusivity!.toUpperCase();
  const windowConflict = windowsConflict(a, b);
  return { languageConflict, territoryConflict, exclusivityConflict, windowConflict };
}

function hasRightsCollision(a: MergeRights[], b: MergeRights[]) {
  const conflicts: Record<string, boolean> = {
    language: false,
    territory: false,
    window: false,
    exclusivity: false,
  };
  for (const left of a) {
    for (const right of b) {
      if (stableJson(left) === stableJson(right)) continue;
      const c = rightsConflict(left, right);
      conflicts.language ||= c.languageConflict;
      conflicts.territory ||= c.territoryConflict;
      conflicts.window ||= c.windowConflict;
      conflicts.exclusivity ||= c.exclusivityConflict;
    }
  }
  return conflicts;
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalized(value));
}

function identicalReferenceSets(a: unknown[], b: unknown[]): boolean {
  if (!a.length || !b.length) return true;
  return stableJson(a) === stableJson(b);
}

export function evaluateDuplicateTitleMerge(input: MergeEvaluationInput): {
  decision: MergeDecision;
  reasons: string[];
  collisions: Record<string, boolean>;
} {
  const reasons: string[] = [];
  if (!input.identityCertain) {
    return { decision: "BLOCK", reasons: ["TITLE_IDENTITY_UNCERTAIN"], collisions: {} };
  }

  // 1. Language collision check
  const titleLanguageConflict =
    Boolean(input.canonical.language && input.retiring.language) &&
    input.canonical.language!.trim().toUpperCase() !== input.retiring.language!.trim().toUpperCase();

  const collisions = hasRightsCollision(input.canonicalRights, input.retiringRights);
  collisions.language ||= titleLanguageConflict;
  if (collisions.language) reasons.push("LANGUAGE_CONFLICT");
  if (collisions.territory) reasons.push("TERRITORY_CONFLICT");
  if (collisions.window) reasons.push("WINDOW_CONFLICT");
  if (collisions.exclusivity) reasons.push("EXCLUSIVITY_CONFLICT");

  // 2. Buyer protection: never retire a live title into a non-live canonical record
  const retiringIsLive = ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(
    input.retiring.status,
  );
  const canonicalIsLive = ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(
    input.canonical.status,
  );
  if (retiringIsLive && !canonicalIsLive) {
    reasons.push("BUYER_VISIBILITY_CONFLICT");
  }

  // 3. Buyer access mappings
  if (
    !identicalReferenceSets(input.canonicalBuyers, input.retiringBuyers) &&
    input.canonicalBuyers.length &&
    input.retiringBuyers.length
  ) {
    reasons.push("BUYER_MAPPING_CONFLICT");
  }

  // 4. Asset version conflict
  if (
    !identicalReferenceSets(input.canonicalAssets, input.retiringAssets) &&
    input.canonicalAssets.length &&
    input.retiringAssets.length
  ) {
    reasons.push("ASSET_VERSION_CONFLICT");
  }

  // 5. Deliveries conflict
  if (
    !identicalReferenceSets(input.canonicalDeliveries, input.retiringDeliveries) &&
    input.canonicalDeliveries.length &&
    input.retiringDeliveries.length
  ) {
    reasons.push("DELIVERY_REFERENCE_CONFLICT");
  }

  // 6. Loop Publication conflict: Fail closed if either title has an active Loop publication
  if (input.canonicalLoopPublications.length || input.retiringLoopPublications.length) {
    reasons.push("LOOP_PUBLICATION_CONFLICT");
  }

  const isHardBlock =
    reasons.includes("LOOP_PUBLICATION_CONFLICT") ||
    reasons.includes("BUYER_VISIBILITY_CONFLICT") ||
    reasons.includes("TITLE_IDENTITY_UNCERTAIN");

  const decision: MergeDecision = isHardBlock ? "BLOCK" : reasons.length ? "HOLD" : "SAFE";
  return { decision, reasons, collisions };
}
