// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}

/**
 * Historical duplicate prefixes are grandfathered by their exact filenames.
 * Do not add new files to these groups; use the next unused numeric prefix.
 */
export const LEGACY_DUPLICATE_MIGRATION_GROUPS = Object.freeze({
  "0018": Object.freeze([
    "0018_bridge_rights_ready_submission.sql",
    "0018_bridge_service_revenue_engine.sql",
    "0018_multilingual_rights_mvp.sql",
    "0018_rights_ready_public_submission.sql",
  ]),
  "0020": Object.freeze([
    "0020_bridge_digital_theatrical_delivery.sql",
    "0020_duplicate_title_merge_gate.sql",
  ]),
});

/**
 * Find numeric-prefix groups containing more than one root migration file.
 * @param {Iterable<string>} paths
 * @returns {Record<string, string[]>}
 */
export function findDuplicateMigrationPrefixes(paths) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const path of paths) {
    const name = migrationName(path);
    if (!isMigrationFile(name)) continue;
    const match = /^(\d{4,})_/.exec(name);
    if (!match) continue;
    const names = groups.get(match[1]) ?? [];
    names.push(name);
    groups.set(match[1], names);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([prefix, names]) => [prefix, names.sort()]),
  );
}

/**
 * Fail when a duplicate-prefix group differs from the exact historical allowlist.
 * This prevents new migrations from reusing legacy prefixes.
 * @param {Iterable<string>} paths
 * @returns {Record<string, string[]>}
 */
export function validateMigrationPrefixes(paths) {
  const duplicates = findDuplicateMigrationPrefixes(paths);
  for (const [prefix, names] of Object.entries(duplicates)) {
    const allowed = LEGACY_DUPLICATE_MIGRATION_GROUPS[prefix];
    if (!allowed || JSON.stringify(names) !== JSON.stringify([...allowed].sort())) {
      throw new Error(
        `Duplicate migration prefix ${prefix}: ${names.join(", ")}. Use a new unique numeric prefix.`,
      );
    }
  }
  return duplicates;
}
