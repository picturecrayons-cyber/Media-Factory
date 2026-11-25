import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const replayScript = join(root, "scripts/supabase-testing-ledger-replay.mjs");
const archiveDir = join(root, "supabase/staging-recovery");

test("all 98 recovered Testing SQL records are complete, ordered, unique, and fingerprint-valid", async () => {
  const records = [];
  for (let part = 1; part <= 10; part += 1) {
    const filename = `ledger-statements-2026-11-25-part-${String(part).padStart(2, "0")}.json`;
    const archive = JSON.parse(await readFile(join(archiveDir, filename), "utf8"));
    assert.equal(archive.source_project, "jbymleftneggcgutlcqu");
    assert.equal(archive.source_table, "supabase_migrations.schema_migrations");
    records.push(...archive.records);
  }

  assert.equal(records.length, 98);
  assert.equal(new Set(records.map((record) => record.version)).size, 98);
  for (let index = 1; index < records.length; index += 1) {
    assert.ok(records[index - 1].version < records[index].version);
  }
  for (const record of records) {
    assert.equal(record.statement_count, 1);
    assert.equal(record.statements.length, 1);
    const actual = createHash("sha256")
      .update(record.statements.join("\n;\n"), "utf8")
      .digest("hex");
    assert.equal(actual, record.sha256, `fingerprint mismatch: ${record.version}`);
  }
});

const rejectedTargets = [
  ["hosted Supabase", "postgresql://postgres:secret@db.example.supabase.co:5432/postgres"],
  ["remote database IP", "postgresql://postgres:secret@203.0.113.10:5432/postgres"],
  ["local default port", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"],
  ["wrong local port", "postgresql://postgres:postgres@localhost:5432/postgres"],
  ["non-Postgres protocol", "https://localhost:55432/postgres"],
  ["local URL with query parameters", "postgresql://postgres:postgres@127.0.0.1:55432/postgres?sslmode=require"],
];

for (const [label, databaseUrl] of rejectedTargets) {
  test(`Testing ledger replay rejects ${label} before connecting`, () => {
    const result = spawnSync(process.execPath, [replayScript], {
      encoding: "utf8",
      env: { ...process.env, TESTING_LEDGER_REPLAY_DATABASE_URL: databaseUrl },
      timeout: 10_000,
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /local Supabase Postgres at localhost:55432\/postgres; hosted databases are forbidden/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/);
  });
}
