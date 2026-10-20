import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePreviewPreflight } from "./preview-release-preflight.mjs";

const validEnv = () => ({
  BRIDGE_RELEASE_GATE_ENV: "preview",
  BRIDGE_CANDIDATE_SHA: "9c56a25e4eba2de63c4c261503112c8945b2dd5a",
  GITHUB_SHA: "9c56a25e4eba2de63c4c261503112c8945b2dd5a",
  VITE_SUPABASE_URL: "https://bbtrosuwisnxacuxvegt.supabase.co",
  BRIDGE_PREVIEW_DATABASE_URL: "postgres://preview:secret@disposable-db.internal:5432/bridge_preview",
  BRIDGE_PREVIEW_DATABASE_DISPOSABLE: "true",
  OCI_TENANCY_OCID: "ocid1.tenancy.oc1..preview",
  BRIDGE_PREVIEW_OCI_TENANCY_OCID: "ocid1.tenancy.oc1..preview",
  OCI_USER_OCID: "ocid1.user.oc1..preview",
  OCI_PRIVATE_KEY: "not-a-real-secret",
  OCI_REGION: "ap-mumbai-1",
  OCI_NAMESPACE: "preview-namespace",
  OCI_BUCKET_NAME: "bridge-preview-only",
  BRIDGE_PREVIEW_OCI_BUCKET: "bridge-preview-only",
  RAZORPAY_KEY_ID: "rzp_test_example",
  RAZORPAY_KEY_SECRET: "not-a-real-secret",
  RAZORPAY_WEBHOOK_SECRET: "not-a-real-secret",
});

test("passes only when preview isolation and test credentials are explicit", () => {
  const result = evaluatePreviewPreflight(validEnv());
  assert.equal(result.ok, true);
  assert.ok(result.checks.every((check) => check.ok));
});

test("blocks production mode", () => {
  const env = validEnv();
  env.BRIDGE_RELEASE_GATE_ENV = "production";
  assert.equal(evaluatePreviewPreflight(env).ok, false);
});

test("blocks candidate SHA mismatch", () => {
  const env = validEnv();
  env.GITHUB_SHA = "2689e35445a11c0422abb2b273c06e550e60435b";
  assert.equal(evaluatePreviewPreflight(env).ok, false);
});

test("blocks canonical production Supabase URL", () => {
  const env = validEnv();
  env.VITE_SUPABASE_URL = "https://mlmgugivsyoxzdgwkbpu.supabase.co";
  assert.equal(evaluatePreviewPreflight(env).ok, false);
});

test("blocks shared staging database even when marked disposable", () => {
  const env = validEnv();
  env.BRIDGE_PREVIEW_DATABASE_URL = "postgres://user:secret@db.bbtrosuwisnxacuxvegt.supabase.co:5432/postgres";
  assert.equal(evaluatePreviewPreflight(env).ok, false);
});

test("blocks a database not explicitly marked disposable", () => {
  const env = validEnv();
  env.BRIDGE_PREVIEW_DATABASE_DISPOSABLE = "false";
  assert.equal(evaluatePreviewPreflight(env).ok, false);
});

test("blocks an OCI bucket that differs from the preview allowlist", () => {
  const env = validEnv();
  env.OCI_BUCKET_NAME = "production-bucket";
  assert.equal(evaluatePreviewPreflight(env).ok, false);
});

test("blocks an OCI tenancy that differs from the preview allowlist", () => {
  const env = validEnv();
  env.OCI_TENANCY_OCID = "ocid1.tenancy.oc1..production";
  assert.equal(evaluatePreviewPreflight(env).ok, false);
});

test("blocks Razorpay live-mode credentials", () => {
  const env = validEnv();
  env.RAZORPAY_KEY_ID = "rzp_live_example";
  assert.equal(evaluatePreviewPreflight(env).ok, false);
});

test("does not print or return secret values", () => {
  const result = evaluatePreviewPreflight(validEnv());
  assert.equal(JSON.stringify(result).includes("not-a-real-secret"), false);
});
