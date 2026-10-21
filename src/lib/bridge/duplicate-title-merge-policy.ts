export type MergeDecision = "SAFE" | "HOLD" | "BLOCK";

export type MergeTitle = {
  id: string;
  name: string;
  slug: string;
  language: string | null;
  status: string;
  owner_user_id: string | null;
  owner_account_type?: string | null;
  year: number | null;
  runtime_minutes: number | null;
  original_language?: string | null;
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
  canonicalLegacyDependencies: unknown[];
  retiringLegacyDependencies: unknown[];
};

function setOf(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean),
  );
}

function equalSet(a: unknown, b: unknown) {
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

function time(v: string | Date | null | undefined) {
  if (!v) return null;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}

function windowsConflict(a: MergeRights, b: MergeRights) {
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
      // Identical grants are the same rights evidence, not a collision.
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

function stableJson(value: unknown) {
  return JSON.stringify(normalized(value));
}

function identicalReferenceSets(a: unknown[], b: unknown[]) {
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

  // These are identity/authority gates, not fields to be silently reconciled.
  if (input.canonical.owner_user_id !== input.retiring.owner_user_id || (input.canonical.owner_account_type && input.retiring.owner_account_type && input.canonical.owner_account_type !== input.retiring.owner_account_type)) reasons.push("TITLE_OWNER_CONFLICT");
  if (input.canonical.status !== input.retiring.status) reasons.push("TITLE_STATUS_CONFLICT");
  if (input.canonical.runtime_minutes !== input.retiring.runtime_minutes) reasons.push("RUNTIME_CONFLICT");
  if (input.canonical.status === "LIVE_FOR_BUYERS" || input.retiring.status === "LIVE_FOR_BUYERS") {
    reasons.push("BUYER_LIFECYCLE_REQUIRES_REVIEW");
  }

  const titleLanguageConflict =
    Boolean(input.canonical.language && input.retiring.language) &&
    input.canonical.language!.trim().toUpperCase() !== input.retiring.language!.trim().toUpperCase();

  const collisions = hasRightsCollision(input.canonicalRights, input.retiringRights);
  collisions.language ||= titleLanguageConflict;
  if (collisions.language) reasons.push("LANGUAGE_CONFLICT");
  if (collisions.territory) reasons.push("TERRITORY_CONFLICT");
  if (collisions.window) reasons.push("WINDOW_CONFLICT");
  if (collisions.exclusivity) reasons.push("EXCLUSIVITY_CONFLICT");

  if (!identicalReferenceSets(input.canonicalBuyers, input.retiringBuyers) && input.canonicalBuyers.length && input.retiringBuyers.length) {
    reasons.push("BUYER_MAPPING_CONFLICT");
  }
  if (!identicalReferenceSets(input.canonicalAssets, input.retiringAssets) && input.canonicalAssets.length && input.retiringAssets.length) {
    reasons.push("ASSET_VERSION_CONFLICT");
  }
  if (!identicalReferenceSets(input.canonicalDeliveries, input.retiringDeliveries) && input.canonicalDeliveries.length && input.retiringDeliveries.length) {
    reasons.push("DELIVERY_REFERENCE_CONFLICT");
  }

  if (input.canonicalLoopPublications.length || input.retiringLoopPublications.length) {
    reasons.push("LOOP_PUBLICATION_CONFLICT");
  }
  if (input.canonicalLegacyDependencies.length || input.retiringLegacyDependencies.length) {
    reasons.push("LEGACY_DEPENDENCY_CONFLICT");
  }

  const hardBlock = reasons.includes("LOOP_PUBLICATION_CONFLICT") || reasons.includes("LEGACY_DEPENDENCY_CONFLICT");
  const decision: MergeDecision = hardBlock ? "BLOCK" : reasons.length ? "HOLD" : "SAFE";
  return { decision, reasons, collisions };
}
