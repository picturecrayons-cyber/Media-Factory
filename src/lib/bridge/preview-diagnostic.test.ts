import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  PREVIEW_STAGING_SUPABASE_REF,
  resolvePreviewDiagnosticTarget,
  supabaseDatabaseProjectRef,
} from "./preview-diagnostic.ts";

const sha = "a".repeat(40);
const stagingUrl = `https://${PREVIEW_STAGING_SUPABASE_REF}.supabase.co`;
const stagingDirectDb = `postgresql://postgres:opaque@db.${PREVIEW_STAGING_SUPABASE_REF}.supabase.co:5432/postgres`;
const stagingPoolerDb = `postgresql://postgres.${PREVIEW_STAGING_SUPABASE_REF}:opaque@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

test("accepts the approved STAGING direct database endpoint without exposing its credentials", () => {
  assert.equal(supabaseDatabaseProjectRef(stagingDirectDb), PREVIEW_STAGING_SUPABASE_REF);
  const result = resolvePreviewDiagnosticTarget({
    vercelEnv: "preview",
    commitSha: sha,
    supabaseUrl: stagingUrl,
    databaseUrl: stagingDirectDb,
  });
  assert.equal(result?.databaseTargetIsStaging, true);
  assert.equal(result?.productionTargetIsExcluded, true);
  assert.equal(JSON.stringify(result).includes("opaque"), false);
});

test("accepts the approved STAGING transaction pooler mapping", () => {
  assert.equal(supabaseDatabaseProjectRef(stagingPoolerDb), PREVIEW_STAGING_SUPABASE_REF);
});

test("rejects Production Supabase URL or database endpoint", () => {
  const productionRef = "mlmgugivsyoxzdgwkbpu";
  const result = resolvePreviewDiagnosticTarget({
    vercelEnv: "preview",
    commitSha: sha,
    supabaseUrl: `https://${productionRef}.supabase.co`,
    databaseUrl: `postgresql://postgres.${productionRef}:opaque@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  });
  assert.equal(result?.databaseTargetIsStaging, false);
  assert.equal(result?.productionTargetIsExcluded, false);
});

test("fails closed for unknown database host patterns and incomplete configuration", () => {
  assert.equal(supabaseDatabaseProjectRef("postgresql://postgres:opaque@db.example.com:5432/postgres"), null);
  const result = resolvePreviewDiagnosticTarget({
    vercelEnv: "preview",
    commitSha: "not-a-sha",
    supabaseUrl: stagingUrl,
    databaseUrl: undefined,
  });
  assert.equal(result?.deploymentSha, null);
  assert.equal(result?.databaseTargetIsStaging, false);
});

test("does not produce a diagnostic target outside Vercel Preview", () => {
  assert.equal(resolvePreviewDiagnosticTarget({ vercelEnv: "production" }), null);
  assert.equal(resolvePreviewDiagnosticTarget({ vercelEnv: "development" }), null);
});

test("auth status endpoint uses deployment Supabase configuration instead of a Production constant", () => {
  const route = readFileSync(new URL("../../routes/api/auth/$.ts", import.meta.url), "utf8");
  assert.match(route, /bridgeEnv\.supabaseUrl\(\)/);
  assert.doesNotMatch(route, /mlmgugivsyoxzdgwkbpu/);
});
