import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const replayScript = fileURLToPath(
  new URL("./supabase-migration-replay.mjs", import.meta.url),
);
const replaySource = readFileSync(replayScript, "utf8");

test("local replay restores Production Bridge RLS on every public Bridge table", () => {
  assert.match(replaySource, /substring\(c\.relname from 1 for 7\) = 'bridge_'/);
  assert.match(replaySource, /alter table public\.%I enable row level security/);
  assert.match(replaySource, /rls_disabled_tables/);
  assert.match(replaySource, /rls_disabled_tables !== 0/);
});

test("core Bridge client policies are authenticated-only and identity/owner scoped", () => {
  for (const policy of [
    "bridge_profiles_self_select",
    "bridge_titles_owner_or_buyer_select",
    "bridge_identity_links_self_select",
    "bridge_buyer_title_access_self_select",
  ]) {
    assert.ok(replaySource.includes(policy), `missing core policy: ${policy}`);
  }
  assert.match(replaySource, /p\.polroles = ARRAY\[\(select oid from pg_roles where rolname = 'authenticated'\)\]/);
  assert.match(replaySource, /position\('auth\.uid\(\)' in coalesce\(pg_get_expr\(p\.polqual, p\.polrelid\), ''\)\) > 0/);
  assert.match(replaySource, /owner_scope_valid/);
  assert.match(replaySource, /authenticated_select/);
  assert.match(replaySource, /anon_select/);
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
  test(`migration replay rejects ${label} before any database connection`, () => {
    const result = spawnSync(process.execPath, [replayScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_REPLAY_DATABASE_URL: databaseUrl,
      },
      timeout: 10_000,
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(
      result.stderr,
      /local Supabase Postgres at localhost:55432\/postgres; remote databases are forbidden/,
    );
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/);
  });
}

const carouselMigration = readFileSync(new URL("../supabase/migrations/20261123120000_bridge_homepage_carousel.sql", import.meta.url), "utf8");
const legalMigration = readFileSync(new URL("../supabase/migrations/20261123170000_bridge_legal_acceptances.sql", import.meta.url), "utf8");
const serviceMigration = readFileSync(new URL("../supabase/migrations/20261123190000_bridge_service_request_workflow.sql", import.meta.url), "utf8");
const siteContentSource = readFileSync(new URL("../src/lib/bridge/site-content.ts", import.meta.url), "utf8");
const homepageSource = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");

test("canonical Preview candidate replays CMS, legal acceptance and service workflow migrations", () => {
  for (const migration of [
    "20261123120000_bridge_homepage_carousel.sql",
    "20261123170000_bridge_legal_acceptances.sql",
    "20261123190000_bridge_service_request_workflow.sql",
  ]) assert.ok(replaySource.includes(migration), `candidate replay missing ${migration}`);
  assert.match(carouselMigration, /ADD COLUMN IF NOT EXISTS carousel_slides/);
  assert.match(carouselMigration, /jsonb_array_length\(carousel_slides\) <= 5/);
  assert.match(legalMigration, /deny_browser_access/);
  assert.match(serviceMigration, /ON DELETE RESTRICT/);
  assert.match(serviceMigration, /FOR UPDATE/);
  assert.match(serviceMigration, /SET search_path TO 'pg_catalog', 'public'/);
  assert.match(serviceMigration, /deny_browser_access/);
});

test("homepage carousel is Super Admin controlled and has no unverified logo placeholder", () => {
  assert.match(siteContentSource, /actor\.internalRole !== "super_admin"/);
  assert.equal(homepageSource.includes("\\n            <Link"), false);
  assert.doesNotMatch(homepageSource, /crayons-loop-logo\.png/);
});

const financeMigration = readFileSync(new URL("../supabase/migrations/20261123200000_bridge_title_finance_and_reconciliation.sql", import.meta.url), "utf8");
const storyReviewMigrationSource = readFileSync(new URL("../supabase/migrations/20261123190000_bridge_service_request_workflow.sql", import.meta.url), "utf8");

test("canonical Preview candidate replays finance, reconciliation and Story Concept review tables", () => {
  assert.ok(replaySource.includes("20261123200000_bridge_title_finance_and_reconciliation.sql"));
  for (const table of [
    "bridge_title_owner_interests","bridge_investment_agreements","bridge_licensing_receipts",
    "bridge_licensing_allocations","bridge_finance_reconciliations","bridge_finance_reconciliation_items",
  ]) assert.ok(financeMigration.includes(`public.${table}`), `missing finance table ${table}`);
  assert.match(financeMigration, /REVOKE ALL/);
  assert.match(financeMigration, /TO anon, authenticated USING \(false\) WITH CHECK \(false\)/);
  assert.match(storyReviewMigrationSource, /bridge_story_concept_review_events/);
  assert.match(storyReviewMigrationSource, /bridge_story_concept_notifications/);
});
