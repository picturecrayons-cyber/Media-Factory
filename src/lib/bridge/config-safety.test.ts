import assert from "node:assert/strict";
import testCase from "node:test";
import {
  assertConsistentIntegrationAliases,
  assertDatabaseMatchesSupabase,
  firstNonBlank,
  resolveConsistentAlias,
  supabaseProjectRefFromDatabaseUrl,
  supabaseProjectRefFromUrl,
} from "./config-safety.ts";

testCase("firstNonBlank skips empty and whitespace-only values", () => {
  assert.equal(firstNonBlank("  ", "", " postgres://staging "), "postgres://staging");
});

testCase("resolveConsistentAlias accepts identical aliases and ignores blanks", () => {
  assert.equal(resolveConsistentAlias("SMTP host", " smtp.example ", "", "smtp.example"), "smtp.example");
});

testCase("resolveConsistentAlias rejects conflicting aliases without echoing values", () => {
  assert.throws(
    () => resolveConsistentAlias("SMTP host", "prod.smtp.example", "preview.smtp.example"),
    (error: unknown) => error instanceof Error &&
      error.message === "CONFIG_MISMATCH: conflicting SMTP host aliases are configured." &&
      !error.message.includes("prod.smtp.example"),
  );
});

testCase("extracts Supabase project refs from API and direct Postgres URLs", () => {
  assert.equal(supabaseProjectRefFromUrl("https://stagingref.supabase.co"), "stagingref");
  assert.equal(
    supabaseProjectRefFromDatabaseUrl("postgresql://postgres:secret@db.stagingref.supabase.co:5432/postgres"),
    "stagingref",
  );
});

testCase("extracts project ref from Supabase pooler username", () => {
  assert.equal(
    supabaseProjectRefFromDatabaseUrl("postgresql://postgres.stagingref:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"),
    "stagingref",
  );
});

testCase("rejects API and database URLs that target different Supabase projects", () => {
  assert.throws(
    () => assertDatabaseMatchesSupabase(
      "https://stagingref.supabase.co",
      "postgresql://postgres:secret@db.productionref.supabase.co:5432/postgres",
    ),
    /Supabase API and PostgreSQL endpoints target different projects/,
  );
});

testCase("does not guess when a database endpoint is not identifiable as Supabase", () => {
  assert.doesNotThrow(() =>
    assertDatabaseMatchesSupabase("https://stagingref.supabase.co", "postgresql://user:secret@db.example.net:5432/app"),
  );
});

testCase("alias consistency helper is safe for secret-bearing configuration", () => {
  assert.throws(
    () => assertConsistentIntegrationAliases("OCI private key", "private-key-A", "private-key-B"),
    (error: unknown) => error instanceof Error &&
      error.message === "CONFIG_MISMATCH: conflicting OCI private key aliases are configured." &&
      !error.message.includes("private-key"),
  );
});
