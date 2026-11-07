import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import {
  APPROVED_STAGING_PROJECT_REF,
  validateStorageE2EAsset,
  validateStorageE2EConfig,
} from "./oci-storage-e2e-guard.mjs";

const validEnv = () => ({
  OCI_TENANCY_OCID: "tenancy",
  OCI_USER_OCID: "user",
  OCI_FINGERPRINT: "fingerprint",
  OCI_PRIVATE_KEY: "private-key",
  OCI_REGION: "ap-south-1",
  OCI_NAMESPACE: "test-namespace",
  OCI_BUCKET_NAME: "bridge-staging-e2e",
  DATABASE_URL: "postgresql://user:pass@db.jbymleftneggcgutlcqu.supabase.co:5432/postgres",
  BRIDGE_E2E_ASSET_ID: "asset-1",
  BRIDGE_E2E_TITLE_ID: "title-1",
  BRIDGE_E2E_ENVIRONMENT: "staging",
  BRIDGE_E2E_ALLOW_DB_MUTATION: "YES",
  BRIDGE_E2E_ALLOW_OCI_MUTATION: "YES",
  BRIDGE_E2E_EXPECTED_SUPABASE_REF: APPROVED_STAGING_PROJECT_REF,
});

const validAsset = () => ({
  id: "asset-1",
  title_id: "title-1",
  title_name: "INTERNAL TEST ONLY — OCI E2E",
  kind: "poster",
  s3_key: "e2e/bridge/poster-1",
  byte_size: null,
  status: "DRAFT",
  created_by: "synthetic-owner",
  owner_user_id: "synthetic-owner",
});

test("storage E2E accepts only the explicitly approved STAGING target", () => {
  assert.deepEqual(validateStorageE2EConfig(validEnv()), {
    ok: true,
    reason: "approved STAGING target configuration",
  });
});

test("storage E2E rejects missing manual mutation consent", () => {
  const env = validEnv();
  env.BRIDGE_E2E_ALLOW_DB_MUTATION = "NO";
  assert.equal(validateStorageE2EConfig(env).ok, false);
});

test("storage E2E rejects Production or any non-canonical database host", () => {
  const env = validEnv();
  env.DATABASE_URL = "postgresql://user:pass@db.mlmgugivsyoxzdgwkbpu.supabase.co:5432/postgres";
  assert.match(validateStorageE2EConfig(env).reason, /approved STAGING/);
});

test("storage E2E rejects a non-test OCI bucket and wrong project reference", () => {
  const bucket = validEnv();
  bucket.OCI_BUCKET_NAME = "bridge-production";
  assert.match(validateStorageE2EConfig(bucket).reason, /staging\/test bucket/);
  bucket.OCI_BUCKET_NAME = "bridge-prod-test";
  assert.match(validateStorageE2EConfig(bucket).reason, /staging\/test bucket/);
  const project = validEnv();
  project.BRIDGE_E2E_EXPECTED_SUPABASE_REF = "mlmgugivsyoxzdgwkbpu";
  assert.match(validateStorageE2EConfig(project).reason, /unexpected Supabase/);
});

test("storage E2E accepts only the named synthetic poster asset", () => {
  assert.equal(validateStorageE2EAsset(validAsset(), "title-1").ok, true);
  assert.equal(validateStorageE2EAsset(validAsset(), "different-title").ok, false);
  assert.equal(validateStorageE2EAsset({ ...validAsset(), title_name: "Production Feature Film" }, "title-1").ok, false);
  assert.equal(validateStorageE2EAsset({ ...validAsset(), kind: "master" }, "title-1").ok, false);
  assert.equal(validateStorageE2EAsset({ ...validAsset(), s3_key: "titles/master.mxf" }, "title-1").ok, false);
  assert.equal(validateStorageE2EAsset({ ...validAsset(), byte_size: 1200 }, "title-1").ok, false);
  assert.equal(validateStorageE2EAsset({ ...validAsset(), created_by: "other-user" }, "title-1").ok, false);
});

test("STAGING-mutating OCI workflow remains absent until CRA-128 Phase 0 is independently accepted", () => {
  const workflow = new URL("../.github/workflows/bridge-oci-storage-e2e.yml", import.meta.url);
  assert.equal(existsSync(workflow), false);
});
