import assert from "node:assert/strict";
import test from "node:test";
import { isMissingOrganizationSchemaError, workspaceFailureCode } from "./workspace-schema.ts";

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
