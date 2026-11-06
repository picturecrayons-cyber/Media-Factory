import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireStagingOnlyEnvironment, REQUIRED_PROJECT_REF } from "./staging-rbac-guard.mjs";

const base = {
  BRIDGE_STAGING_PROJECT_REF: REQUIRED_PROJECT_REF,
  BRIDGE_STAGING_SUPABASE_URL: `https://${REQUIRED_PROJECT_REF}.supabase.co`,
  BRIDGE_STAGING_DATABASE_URL: `postgresql://postgres.${REQUIRED_PROJECT_REF}:test-password@db.${REQUIRED_PROJECT_REF}.supabase.co:5432/postgres`,
};

describe("staging RBAC environment guard", () => {
  it("accepts only the approved Testing project direct database host", () => {
    assert.equal(requireStagingOnlyEnvironment(base), base.BRIDGE_STAGING_DATABASE_URL);
  });

  it("accepts a Supabase pooler only with the exact Testing project username", () => {
    const env = {
      ...base,
      BRIDGE_STAGING_DATABASE_URL: `postgresql://postgres.${REQUIRED_PROJECT_REF}:test-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    };
    assert.equal(requireStagingOnlyEnvironment(env), env.BRIDGE_STAGING_DATABASE_URL);
  });

  it("rejects the Production project even when supplied consistently", () => {
    const production = "mlmgugivsyoxzdgwkbpu";
    assert.throws(() => requireStagingOnlyEnvironment({
      ...base,
      BRIDGE_STAGING_PROJECT_REF: production,
      BRIDGE_STAGING_SUPABASE_URL: `https://${production}.supabase.co`,
      BRIDGE_STAGING_DATABASE_URL: `postgresql://postgres.${production}:x@db.${production}.supabase.co:5432/postgres`,
    }), /explicitly forbidden/);
  });

  it("rejects the obsolete staging project", () => {
    assert.throws(() => requireStagingOnlyEnvironment({
      ...base,
      BRIDGE_STAGING_PROJECT_REF: "bbtrosuwisnxacuxvegt",
    }), /explicitly forbidden/);
  });

  it("rejects mismatched Supabase API and database hosts", () => {
    assert.throws(() => requireStagingOnlyEnvironment({
      ...base,
      BRIDGE_STAGING_SUPABASE_URL: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
    }), /exact Testing project/);
    assert.throws(() => requireStagingOnlyEnvironment({
      ...base,
      BRIDGE_STAGING_DATABASE_URL: "postgresql://postgres.other-project:x@db.other-project.supabase.co:5432/postgres",
    }), /host\/user/);
  });

  it("rejects a pooler username that does not exactly identify the Testing project", () => {
    assert.throws(() => requireStagingOnlyEnvironment({
      ...base,
      BRIDGE_STAGING_DATABASE_URL: `postgresql://postgres.mlmgugivsyoxzdgwkbpu:x@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    }), /host\/user/);
  });

  it("rejects non-HTTPS API URLs and non-Postgres database URLs", () => {
    assert.throws(() => requireStagingOnlyEnvironment({
      ...base,
      BRIDGE_STAGING_SUPABASE_URL: `http://${REQUIRED_PROJECT_REF}.supabase.co`,
    }), /HTTPS/);
    assert.throws(() => requireStagingOnlyEnvironment({
      ...base,
      BRIDGE_STAGING_DATABASE_URL: "https://example.com",
    }), /Postgres protocol/);
  });
});
