import { createHash } from "node:crypto";

/** Normalize only platform line endings and the terminal newline. SQL content,
 * comments, and internal whitespace remain part of the digest. */
export function normalizeMigrationSql(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\n+$/, "") + "\n";
}

export function migrationSqlDigest(value) {
  return createHash("sha256").update(normalizeMigrationSql(value), "utf8").digest("hex");
}

/**
 * Build a one-to-one, content-addressed crosswalk between Supabase's migration
 * history and the app's top-level migration files. This is deliberately strict:
 * ambiguous, missing, duplicate, or changed SQL blocks migration.
 */
export function reconcileMigrationHistory({ repositoryMigrations, supabaseMigrations, appMigrationNames }) {
  const blockers = [];
  const mappedNames = [];
  const usedNames = new Set();
  const versions = new Set();

  if (!Array.isArray(repositoryMigrations) || !Array.isArray(supabaseMigrations) || !Array.isArray(appMigrationNames)) {
    return { compatible: false, blockers: ["Migration history inputs are incomplete."], mappedNames: [] };
  }

  const repositoryByDigest = new Map();
  for (const migration of repositoryMigrations) {
    if (!migration?.name || typeof migration.content !== "string") {
      blockers.push("Repository migration inventory contains an invalid entry.");
      continue;
    }
    const digest = migrationSqlDigest(migration.content);
    const matches = repositoryByDigest.get(digest) ?? [];
    matches.push(migration.name);
    repositoryByDigest.set(digest, matches);
  }

  for (const record of supabaseMigrations) {
    const version = String(record?.version ?? "");
    const statements = record?.statements;
    if (!version || versions.has(version)) {
      blockers.push(`Supabase migration version is missing or duplicated: ${version || "(empty)"}.`);
      continue;
    }
    versions.add(version);
    const sql = Array.isArray(statements) ? statements.join("\n") : "";
    if (!sql.trim()) {
      blockers.push(`Supabase migration ${version} has no readable SQL statements.`);
      continue;
    }
    const matches = repositoryByDigest.get(migrationSqlDigest(sql)) ?? [];
    if (matches.length !== 1) {
      blockers.push(
        matches.length === 0
          ? `Supabase migration ${version} (${record.name ?? "unnamed"}) has no exact repository SQL match.`
          : `Supabase migration ${version} has ambiguous repository matches: ${matches.join(", ")}.`,
      );
      continue;
    }
    const [name] = matches;
    if (usedNames.has(name)) {
      blockers.push(`Repository migration ${name} is mapped to more than one Supabase record.`);
      continue;
    }
    usedNames.add(name);
    mappedNames.push(name);
  }

  const appNames = [...new Set(appMigrationNames.map(String))].sort();
  const expectedNames = [...mappedNames].sort();
  if (appNames.length !== appMigrationNames.length) {
    blockers.push("App _migrations ledger contains duplicate migration names.");
  }
  if (appNames.join("\n") !== expectedNames.join("\n")) {
    blockers.push("App _migrations ledger does not exactly match the content-reconciled Supabase migration set.");
  }

  return { compatible: blockers.length === 0, blockers, mappedNames: expectedNames };
}
