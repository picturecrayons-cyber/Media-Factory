import assert from "node:assert/strict";
import test from "node:test";
import { isMissingOrganizationSchemaError, workspaceFailureCode } from "./workspace-schema.ts";
import { resolveBridgeDatabaseUrl } from "./database-binding.ts";

test("missing organization relation triggers profile-only fallback", () => {
  assert.equal(isMissingOrganizationSchemaError({ code: "42P01", message: 'relation "bridge_organization_memberships" does not exist' }), true);
});

test("missing organization_id column triggers profile-only fallback", () => {
  assert.equal(isMissingOrganizationSchemaError({ code: "42703", message: "column bp.organization_id does not exist" }), true);
});

test("authorization and connectivity failures do not trigger organization fallback", () => {
  assert.equal(isMissingOrganizationSchemaError({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingOrganizationSchemaError({ code: "08006", message: "connection failure" }), false);
});

test("workspace failure diagnostics classify missing config and schema without leaking details", () => {
  assert.equal(workspaceFailureCode(new Error("DATABASE_URL or POSTGRES_URL is required on Vercel")), "CONFIG_MISSING");
  assert.equal(workspaceFailureCode({ code: "42P01", message: "relation missing" }), "MISSING_RELATION");
  assert.equal(workspaceFailureCode(new Error("permission denied")), "WORKSPACE_QUERY_FAILED");
});



test("approved STAGING Preview rejects an injected Postgres URL for another Supabase project", () => {
  assert.throws(
    () =>
      resolveBridgeDatabaseUrl({
        VERCEL_ENV: "preview",
        BRIDGE_DATABASE_TARGET: "staging",
        SUPABASE_URL: "https://jbymleftneggcgutlcqu.supabase.co",
        POSTGRES_URL: "postgresql://postgres:secret@db.bbtrosuwisnxacuxvegt.supabase.co:5432/postgres",
      }),
    /does not match the configured STAGING Supabase project/,
  );
});

test("approved STAGING Preview accepts a matching direct database host", () => {
  assert.equal(
    resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview",
      BRIDGE_DATABASE_TARGET: "staging",
      SUPABASE_URL: "https://jbymleftneggcgutlcqu.supabase.co",
      DATABASE_URL: "postgresql://postgres:secret@db.jbymleftneggcgutlcqu.supabase.co:5432/postgres",
    }),
    "postgresql://postgres:secret@db.jbymleftneggcgutlcqu.supabase.co:5432/postgres",
  );
});

test("approved STAGING Preview accepts a pooler URL only when its username is project-scoped", () => {
  assert.equal(
    resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview",
      BRIDGE_DATABASE_TARGET: "staging",
      SUPABASE_URL: "https://jbymleftneggcgutlcqu.supabase.co",
      POSTGRES_URL: "postgresql://postgres.jbymleftneggcgutlcqu:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
    }),
    "postgresql://postgres.jbymleftneggcgutlcqu:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
  );
});

test("approved STAGING Preview rejects a missing or malformed Supabase project URL", () => {
  assert.throws(
    () =>
      resolveBridgeDatabaseUrl({
        VERCEL_ENV: "preview",
        BRIDGE_DATABASE_TARGET: "staging",
        POSTGRES_URL: "postgresql://postgres:secret@db.jbymleftneggcgutlcqu.supabase.co:5432/postgres",
      }),
    /valid STAGING Supabase URL/,
  );
});

test("non-STAGING environments preserve database fallback behavior and ignore blank values", () => {
  assert.equal(
    resolveBridgeDatabaseUrl({
      VERCEL_ENV: "production",
      DATABASE_URL: " ",
      POSTGRES_URL: "postgresql://postgres:secret@db.other.supabase.co:5432/postgres",
    }),
    "postgresql://postgres:secret@db.other.supabase.co:5432/postgres",
  );
});
