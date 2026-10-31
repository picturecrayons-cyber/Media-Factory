export type AssetVersionCandidate = {
  id: string;
  kind: string;
  created_at: string | Date;
  content_type?: string | null;
};

/**
 * Return one current gallery entry per asset kind and content type while preserving
 * all source rows for audit/history. Distinct formats remain independently visible. Callers must pass only verified assets.
 */
function timestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

export function selectCurrentAssets<T extends AssetVersionCandidate>(
  rows: T[],
): Array<T & { versionNumber: number; versionCount: number }> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = row.kind + "\u0000" + (row.content_type ?? "");
    const group = grouped.get(groupKey) ?? [];
    group.push(row);
    grouped.set(groupKey, group);
  }

  const current: Array<T & { versionNumber: number; versionCount: number }> = [];
  for (const versions of grouped.values()) {
    versions.sort((a, b) => {
      const timeDifference = timestamp(b.created_at) - timestamp(a.created_at);
      if (timeDifference !== 0) return timeDifference;
      return b.id.localeCompare(a.id);
    });
    const latest = versions[0];
    if (latest) {
      current.push({
        ...latest,
        versionNumber: versions.length,
        versionCount: versions.length,
      });
    }
  }
  return current.sort((a, b) => {
    const timeDifference = timestamp(b.created_at) - timestamp(a.created_at);
    return timeDifference !== 0 ? timeDifference : b.id.localeCompare(a.id);
  });
}
