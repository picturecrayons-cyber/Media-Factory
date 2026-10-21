import assert from "node:assert/strict";
import test from "node:test";
import { assertNonProductionOciE2E } from "./oci-e2e-environment.mjs";

const safeEnv = {
  BRIDGE_OCI_E2E_ENVIRONMENT: "non-production",
  OCI_BUCKET_NAME: "bridge-preview-test-bucket",
  BRIDGE_OCI_E2E_CONFIRM_BUCKET: "bridge-preview-test-bucket",
  SUPABASE_URL: "https://preview-project.supabase.co",
  BRIDGE_OCI_E2E_CONFIRM_SUPABASE_HOST: "preview-project.supabase.co",
};

test("refuses OCI E2E unless non-production environment is explicitly attested", () => {
  assert.throws(
    () => assertNonProductionOciE2E({ ...safeEnv, BRIDGE_OCI_E2E_ENVIRONMENT: "production" }),
    /Refusing OCI E2E/,
  );
  const { BRIDGE_OCI_E2E_ENVIRONMENT, ...missing } = safeEnv;
  assert.throws(() => assertNonProductionOciE2E(missing), /Refusing OCI E2E/);
});

test("refuses OCI E2E when the confirmed bucket does not match configured bucket", () => {
  assert.throws(
    () => assertNonProductionOciE2E({ ...safeEnv, BRIDGE_OCI_E2E_CONFIRM_BUCKET: "another-bucket" }),
    /must exactly match OCI_BUCKET_NAME/,
  );
});

test("refuses OCI E2E when the confirmed Supabase host does not match configured host", () => {
  assert.throws(
    () => assertNonProductionOciE2E({
      ...safeEnv,
      BRIDGE_OCI_E2E_CONFIRM_SUPABASE_HOST: "production-project.supabase.co",
    }),
    /must exactly match the configured Supabase host/,
  );
});

test("accepts explicitly confirmed non-production target and returns non-secret identifiers", () => {
  assert.deepEqual(assertNonProductionOciE2E(safeEnv), {
    bucket: "bridge-preview-test-bucket",
    supabaseHost: "preview-project.supabase.co",
  });
});
