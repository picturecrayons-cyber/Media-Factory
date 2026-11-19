import test from "node:test";
import assert from "node:assert/strict";
import { assertProductionDatabaseTarget, compareObjectSizes, isCanonicalMasterVerified, classifyObjectError } from "./oci-production-master-verification-lib.mjs";

const ref = "mlmgugivsyoxzdgwkbpu";
const api = `https://${ref}.supabase.co`;

test("accepts the exact Supabase direct database host", () => {
  assert.equal(assertProductionDatabaseTarget(api, `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`, ref), true);
});

test("accepts a pooler URL only when its username pins the project ref", () => {
  assert.equal(assertProductionDatabaseTarget(api, `postgresql://postgres.${ref}:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`, ref), true);
});

test("rejects a different Supabase database project", () => {
  assert.throws(() => assertProductionDatabaseTarget(api, "postgresql://postgres:secret@db.otherproject.supabase.co:5432/postgres", ref), /does not prove/);
});

test("rejects a wrong Supabase API project", () => {
  assert.throws(() => assertProductionDatabaseTarget("https://otherproject.supabase.co", `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`, ref), /expected Production project/);
});

test("detects exact database and OCI byte-size match", () => {
  assert.deepEqual(compareObjectSizes(1024, 1024), { status: "MATCH", matches: true });
});

test("flags database and OCI byte-size mismatch", () => {
  assert.deepEqual(compareObjectSizes(1024, 1025), { status: "MISMATCH", matches: false });
});

test("does not treat a missing database size as a match", () => {
  assert.deepEqual(compareObjectSizes(null, 1024), { status: "UNRECORDED", matches: false });
});

test("requires master_key to resolve to an existing size-matched candidate", () => {
  const objects = [{ objectKey: "master-a", result: "EXISTS", sizeStatus: "MATCH" }];
  assert.equal(isCanonicalMasterVerified("master-a", objects), true);
  assert.equal(isCanonicalMasterVerified(null, objects), false);
  assert.equal(isCanonicalMasterVerified("master-b", objects), false);
  assert.equal(isCanonicalMasterVerified("master-a", [{ objectKey: "master-a", result: "NOT_FOUND", sizeStatus: "MATCH" }]), false);
});

test("classifies an OCI 404 as a missing object", () => {
  assert.equal(classifyObjectError("OCI object verification failed (404)"), "NOT_FOUND");
});

test("classifies non-404 OCI failures as errors", () => {
  assert.equal(classifyObjectError("OCI object verification failed (401)"), "ERROR");
});
