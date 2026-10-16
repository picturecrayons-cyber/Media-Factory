import assert from "node:assert/strict";
import test from "node:test";
import {
  requireEnvironment,
  requireExplicitFlag,
  requirePreviewDatabase,
} from "./oci-e2e-safety.mjs";

function withEnv(values, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("OCI E2E requires an explicit operator flag", () => {
  const original = [...process.argv];
  try {
    process.argv = process.argv.filter((arg) => arg !== "--confirm-mutable");
    assert.throws(() => requireExplicitFlag("--confirm-mutable", "test approval"), /Blocked/);
    process.argv.push("--confirm-mutable");
    assert.doesNotThrow(() => requireExplicitFlag("--confirm-mutable", "test approval"));
  } finally {
    process.argv = original;
  }
});

test("OCI E2E reports missing environment variables by name", () => {
  const key = "BRIDGE_E2E_SAFETY_TEST_MISSING";
  const previous = process.env[key];
  delete process.env[key];
  try {
    assert.throws(() => requireEnvironment([key]), new RegExp(key));
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("Preview database guard rejects canonical production direct and pooler URLs", () => {
  withEnv({ BRIDGE_E2E_ENVIRONMENT: "preview", VERCEL_ENV: "preview" }, () => {
    assert.throws(
      () => requirePreviewDatabase("postgres://postgres:secret@db.mlmgugivsyoxzdgwkbpu.supabase.co:5432/postgres"),
      /production database/,
    );
    assert.throws(
      () => requirePreviewDatabase("postgres://postgres.mlmgugivsyoxzdgwkbpu:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"),
      /production database/,
    );
  });
});

test("Preview database guard accepts a PostgreSQL URL only with Preview markers", () => {
  withEnv({ BRIDGE_E2E_ENVIRONMENT: "preview", VERCEL_ENV: "preview" }, () => {
    assert.doesNotThrow(
      () => requirePreviewDatabase("postgres://preview_user:secret@preview-db.example.invalid:5432/bridge_preview"),
    );
  });
  withEnv({ BRIDGE_E2E_ENVIRONMENT: "production", VERCEL_ENV: "production" }, () => {
    assert.throws(
      () => requirePreviewDatabase("postgres://preview_user:secret@preview-db.example.invalid:5432/bridge_preview"),
      /not "preview"/,
    );
  });
});
