import assert from "node:assert/strict";
import test from "node:test";
import { isMissingOrganizationSchemaError, workspaceFailureCode, workspaceFailureMessage } from "./workspace-schema.ts";

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


test("workspace failure messages give safe next-step context without exposing SQL details", () => {
  assert.match(workspaceFailureMessage("CONFIG_MISSING"), /backend configuration is incomplete/);
  assert.match(workspaceFailureMessage("MISSING_RELATION"), /schema is incomplete/);
  assert.match(workspaceFailureMessage("WORKSPACE_QUERY_FAILED"), /could not verify your workspace session/);
  for (const code of ["CONFIG_MISSING", "MISSING_RELATION", "WORKSPACE_QUERY_FAILED"] as const) {
    assert.match(workspaceFailureMessage(code), /No onboarding changes were made/);
    assert.doesNotMatch(workspaceFailureMessage(code), /select |postgres|supabase\.co|password|token/i);
  }
});
