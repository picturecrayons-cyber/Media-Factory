import assert from "node:assert/strict";
import { test } from "node:test";
import {
  migrationSqlDigest,
  normalizeMigrationSql,
  reconcileMigrationHistory,
} from "./migration-reconciliation.mjs";

const file = (name, content) => ({ name, content });
const record = (version, content, name = "migration") => ({
  version,
  name,
  statements: [content],
});

test("normalizes CRLF and terminal newlines but preserves SQL content", () => {
  assert.equal(normalizeMigrationSql("select 1;\r\n"), "select 1;\n");
  assert.equal(migrationSqlDigest("select 1;\r\n"), migrationSqlDigest("select 1;\n"));
  assert.notEqual(migrationSqlDigest("select 1;"), migrationSqlDigest("select 2;"));
});

test("accepts a one-to-one exact content crosswalk with matching app ledger", () => {
  const sqlA = "-- A\ncreate table a(id int);\n";
  const sqlB = "-- B\ncreate table b(id int);\n";
  const result = reconcileMigrationHistory({
    repositoryMigrations: [file("0001_a.sql", sqlA), file("0002_b.sql", sqlB)],
    supabaseMigrations: [record("20260101000000", sqlA), record("20260102000000", sqlB)],
    appMigrationNames: ["0001_a.sql", "0002_b.sql"],
  });
  assert.equal(result.compatible, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.mappedNames, ["0001_a.sql", "0002_b.sql"]);
});

test("fails closed when Supabase history has no exact repository SQL match", () => {
  const result = reconcileMigrationHistory({
    repositoryMigrations: [file("0001_a.sql", "create table a(id int);")],
    supabaseMigrations: [record("20260101000000", "create table changed(id int);")],
    appMigrationNames: [],
  });
  assert.equal(result.compatible, false);
  assert.match(result.blockers.join(" "), /no exact repository SQL match/);
});

test("fails closed when the same SQL ambiguously maps to multiple repository files", () => {
  const sql = "create table a(id int);";
  const result = reconcileMigrationHistory({
    repositoryMigrations: [file("0001_a.sql", sql), file("0002_a.sql", sql)],
    supabaseMigrations: [record("20260101000000", sql)],
    appMigrationNames: ["0001_a.sql"],
  });
  assert.equal(result.compatible, false);
  assert.match(result.blockers.join(" "), /ambiguous repository matches/);
});

test("fails closed when one repository file would satisfy multiple Supabase versions", () => {
  const sql = "create table a(id int);";
  const result = reconcileMigrationHistory({
    repositoryMigrations: [file("0001_a.sql", sql)],
    supabaseMigrations: [
      record("20260101000000", sql),
      record("20260102000000", sql),
    ],
    appMigrationNames: ["0001_a.sql"],
  });
  assert.equal(result.compatible, false);
  assert.match(result.blockers.join(" "), /mapped to more than one Supabase record/);
});

test("fails closed for duplicate Supabase versions", () => {
  const sql = "create table a(id int);";
  const result = reconcileMigrationHistory({
    repositoryMigrations: [file("0001_a.sql", sql)],
    supabaseMigrations: [
      record("20260101000000", sql),
      record("20260101000000", sql),
    ],
    appMigrationNames: ["0001_a.sql"],
  });
  assert.equal(result.compatible, false);
  assert.match(result.blockers.join(" "), /version is missing or duplicated/);
});

test("fails closed when app and Supabase ledgers disagree", () => {
  const sql = "create table a(id int);";
  const result = reconcileMigrationHistory({
    repositoryMigrations: [file("0001_a.sql", sql)],
    supabaseMigrations: [record("20260101000000", sql)],
    appMigrationNames: [],
  });
  assert.equal(result.compatible, false);
  assert.match(result.blockers.join(" "), /does not exactly match/);
});

test("fails closed for incomplete or unreadable migration history", () => {
  const result = reconcileMigrationHistory({
    repositoryMigrations: [],
    supabaseMigrations: [record("20260101000000", "")],
    appMigrationNames: [],
  });
  assert.equal(result.compatible, false);
  assert.match(result.blockers.join(" "), /no readable SQL statements/);
});
