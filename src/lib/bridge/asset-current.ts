export type AssetVersionCandidate = {
  id: string;
  kind: string;
  created_at: string | Date;
};

/**
 * Return one current gallery entry per asset kind while preserving all source
 * rows for audit/history. Callers must pass only verified assets.
 */
export function selectCurrentAssets<T extends AssetVersionCandidate>(
  rows: T[],
): Array<T & { versionNumber: number; versionCount: number }> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.kind) ?? [];
    group.push(row);
    grouped.set(row.kind, group);
  }

  const current: Array<T & { versionNumber: number; versionCount: number }> = [];
  for (const versions of grouped.values()) {
    versions.sort((a, b) => {
      const timeDifference =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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
    const timeDifference =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return timeDifference !== 0 ? timeDifference : b.id.localeCompare(a.id);
  });
}
