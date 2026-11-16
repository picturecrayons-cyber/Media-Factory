import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const script = new URL("./release-readiness.mjs", import.meta.url);
const baseEnv = {
  OCI_TENANCY_OCID: "test-tenancy",
  OCI_USER_OCID: "test-user",
  OCI_PRIVATE_KEY: "test-private-key",
  OCI_REGION: "ap-mumbai-1",
  OCI_NAMESPACE: "test-namespace",
  OCI_BUCKET_NAME: "primary-bucket",
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  RAZORPAY_KEY_ID: "test-key",
  RAZORPAY_KEY_SECRET: "test-secret",
  RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
  MAIL_FROM: "test@example.invalid",
  SMTP_HOST: "smtp.example.invalid",
  SMTP_PORT: "587",
  SMTP_USER: "test-user",
  SMTP_PASS: "test-password",
};

function run(overrides = {}) {
  return spawnSync(process.execPath, [script.pathname], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...baseEnv, ...overrides },
  });
}

test("release readiness passes only with a distinct OCI Recovery bucket configured", () => {
  const result = run({ OCI_RECOVERY_BUCKET_NAME: "recovery-bucket" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS  ociRecovery/);
});

test("release readiness blocks when OCI Recovery bucket is missing", () => {
  const result = run({ OCI_RECOVERY_BUCKET_NAME: "" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /BLOCKED  ociRecovery/);
  assert.match(result.stdout, /OCI_RECOVERY_BUCKET_NAME/);
});

test("release readiness blocks when Primary and Recovery buckets are identical", () => {
  const result = run({ OCI_RECOVERY_BUCKET_NAME: "primary-bucket" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /BLOCKED  ociRecovery/);
  assert.match(result.stdout, /must differ from OCI_BUCKET_NAME/);
});
